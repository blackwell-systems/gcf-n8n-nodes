/**
 * GCF Node - n8n community node for GCF (Graph Compact Format) conversion
 *
 * Provides bidirectional encode/decode between JSON and GCF.
 * GCF achieves 71% fewer tokens than JSON with 90.7% LLM comprehension.
 *
 * https://gcformat.com
 */

import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { encode, decode, encodeGeneric, decodeGeneric } from '@blackwell-systems/gcf';

export class Gcf implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'GCF',
		name: 'gcf',
		icon: 'file:gcf.svg',
		group: ['transform'],
		version: 1,
		description: 'Convert between GCF and JSON. 71% fewer tokens for LLM tool responses.',
		subtitle: '={{$parameter["operation"]}}',
		defaults: {
			name: 'GCF',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Encode (JSON to GCF)',
						value: 'encode',
						description: 'Convert JSON data to GCF format',
						action: 'Encode JSON to GCF',
					},
					{
						name: 'Decode (GCF to JSON)',
						value: 'decode',
						description: 'Parse GCF format back to JSON',
						action: 'Decode GCF to JSON',
					},
				],
				default: 'encode',
			},

			// Input Data
			{
				displayName: 'Input Data',
				name: 'inputData',
				type: 'string',
				default: '={{ $json }}',
				description:
					'The data to convert. For encoding: drag JSON data or use {{ $json }}. For decoding: a GCF-formatted string.',
				displayOptions: {
					show: {
						operation: ['encode'],
					},
				},
			},
			{
				displayName: 'Input Data',
				name: 'inputData',
				type: 'string',
				default: '',
				description:
					'The GCF string to decode back to JSON. Use a field reference (e.g. "data") or paste GCF text directly.',
				displayOptions: {
					show: {
						operation: ['decode'],
					},
				},
			},

			// Output Field
			{
				displayName: 'Output Field',
				name: 'outputField',
				type: 'string',
				default: 'data',
				description: 'Field name to store the converted output',
			},

			// Additional Options
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Include Token Metrics',
						name: 'includeTokenMetrics',
						type: 'boolean',
						default: false,
						description:
							'Whether to include estimated token count comparison between JSON and GCF in the output',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const outputField = this.getNodeParameter('outputField', itemIndex) as string;
				const inputDataParam = this.getNodeParameter('inputData', itemIndex);

				let inputData: unknown;

				// Auto-detect: if n8n evaluated an expression (non-string), use directly.
				// If string, try field path navigation first, then use as literal.
				if (typeof inputDataParam !== 'string') {
					inputData = inputDataParam;
				} else {
					const fieldPath = inputDataParam.split('.');
					inputData = fieldPath.reduce((obj: IDataObject | unknown, key: string) => {
						if (obj === null || obj === undefined) return undefined;
						const arrayMatch = key.match(/^(.+?)\[(\d+)\]$/);
						if (arrayMatch) {
							const [, arrayName, indexStr] = arrayMatch;
							const index = parseInt(indexStr, 10);
							const objAsRecord = obj as Record<string, unknown>;
							const arrayValue = objAsRecord[arrayName] as unknown[];
							return arrayValue?.[index];
						}
						return (obj as IDataObject)[key];
					}, items[itemIndex].json as IDataObject);

					// If field path returned undefined and we're decoding, treat as literal GCF text
					if (inputData === undefined && operation === 'decode') {
						inputData = inputDataParam;
					}
				}

				let result: unknown;
				let tokenMetrics: IDataObject | undefined;

				switch (operation) {
					case 'encode': {
						const encodeResult = encodeData(inputData);
						result = encodeResult.gcf;

						const additionalOptions = this.getNodeParameter(
							'additionalOptions',
							itemIndex,
							{},
						) as IDataObject;
						const includeTokenMetrics =
							(additionalOptions.includeTokenMetrics as boolean) ?? false;

						if (includeTokenMetrics) {
							const jsonString = JSON.stringify(inputData);
							const jsonTokens = estimateTokenCount(jsonString);
							const gcfTokens = estimateTokenCount(encodeResult.gcf);
							const saved = jsonTokens - gcfTokens;
							const reduction = jsonTokens > 0 ? saved / jsonTokens : 0;

							tokenMetrics = {
								jsonTokens,
								gcfTokens,
								tokensSaved: saved,
								reductionPercent: Math.round(reduction * 10000) / 100,
							};
						}
						break;
					}
					case 'decode':
						result = decodeData(inputData, this, itemIndex);
						break;
					default:
						throw new NodeOperationError(
							this.getNode(),
							`Unknown operation: ${operation}`,
							{ itemIndex },
						);
				}

				const outputJson = {
					...(items[itemIndex].json as object),
					[outputField]: result,
				} as IDataObject;

				if (tokenMetrics) {
					outputJson.tokenMetrics = tokenMetrics;
				}

				returnData.push({
					json: outputJson,
					pairedItem: { item: itemIndex },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
							itemIndex,
						},
						pairedItem: { item: itemIndex },
					});
				} else {
					throw new NodeOperationError(this.getNode(), error as Error, {
						itemIndex,
					});
				}
			}
		}

		return [returnData];
	}
}

/**
 * Encode JSON data to GCF.
 * Detects graph-shaped data (has `tool` + `symbols` fields) and uses the
 * graph-profile encoder; otherwise uses the generic encoder.
 */
function encodeData(data: unknown): { gcf: string } {
	if (isGraphPayload(data)) {
		return { gcf: encode(data as any) };
	}
	return { gcf: encodeGeneric(data) };
}

/**
 * Decode GCF text back to JSON.
 * Detects graph-profile headers and routes to the appropriate decoder.
 */
function decodeData(
	data: unknown,
	context: IExecuteFunctions,
	itemIndex: number,
): unknown {
	if (typeof data !== 'string') {
		throw new NodeOperationError(
			context.getNode(),
			'Input must be a string for GCF to JSON conversion. Got: ' + typeof data,
			{ itemIndex },
		);
	}

	if (data.startsWith('GCF profile=graph')) {
		const payload = decode(data);
		return payload;
	}

	return decodeGeneric(data);
}

/**
 * Check if data looks like a GCF graph payload (has tool + symbols fields).
 */
function isGraphPayload(data: unknown): boolean {
	if (data === null || data === undefined || typeof data !== 'object') return false;
	const obj = data as Record<string, unknown>;
	return typeof obj.tool === 'string' && Array.isArray(obj.symbols);
}

/**
 * Estimate token count using a simple heuristic.
 * Approximates common tokenizers at roughly 4 characters per token.
 */
function estimateTokenCount(text: string): number {
	return Math.ceil(text.length / 4);
}
