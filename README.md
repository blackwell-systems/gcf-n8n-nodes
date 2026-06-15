# n8n-nodes-gcf

n8n community node for [GCF (Graph Compact Format)](https://gcformat.com) -- bidirectional conversion between GCF and JSON with 71% fewer tokens and zero config.

GCF is a structured data wire format optimized for LLM tool responses. It achieves 90.7% comprehension across 10 models while cutting token costs by 71% compared to JSON.

## Installation

In your n8n instance:

```bash
npm install n8n-nodes-gcf
```

Or install via the n8n UI: **Settings > Community Nodes > Install > `n8n-nodes-gcf`**

## Operations

### Encode (JSON to GCF)

Converts JSON input to GCF format. Automatically detects whether to use the graph profile (for tool payloads with `tool` + `symbols` fields) or the generic profile (everything else).

- **Input Data**: Drag and drop JSON data, use `{{ $json }}`, or reference a field name
- **Output Field**: Field name for the GCF output (default: `data`)
- **Include Token Metrics**: Adds estimated token counts for JSON vs GCF with reduction percentage

### Decode (GCF to JSON)

Parses GCF text back into JSON. Automatically detects graph vs generic profile from the header.

- **Input Data**: A GCF-formatted string (field reference or literal text)
- **Output Field**: Field name for the JSON output (default: `data`)

## AI Agent Integration

This node has `usableAsTool: true`, so n8n AI agents can use it directly to compress tool responses before sending them to the LLM, saving tokens on every call.

## Example Workflow

1. **HTTP Request** node fetches API data (JSON)
2. **GCF** node encodes it to GCF (Encode operation)
3. **AI Agent** node receives the compressed payload, saving 71% on input tokens
4. **GCF** node decodes agent output back to JSON (Decode operation)

## Token Savings

Enable "Include Token Metrics" to see per-item comparisons:

```json
{
  "data": "GCF profile=generic\n...",
  "tokenMetrics": {
    "jsonTokens": 1200,
    "gcfTokens": 350,
    "tokensSaved": 850,
    "reductionPercent": 70.83
  }
}
```

## Links

- [GCF Specification](https://gcformat.com)
- [Interactive Playground](https://gcformat.com/playground)
- [Benchmark Results](https://gcformat.com/guide/benchmarks)
- [GitHub](https://github.com/blackwell-systems/gcf-n8n-nodes)
- [GCF TypeScript Library](https://www.npmjs.com/package/@blackwell-systems/gcf)

## Why GCF over TOON?

| | GCF | TOON |
|---|---|---|
| Token savings vs JSON | **71%** | 40% |
| GCF vs TOON (15 datasets) | **25.5% fewer** | baseline |
| LLM comprehension (500 records) | **100%** on every frontier model | Fails on GPT-5.5 |
| LLM generation validity | **5/5** on every frontier model | Rejected by 7/9 models |
| Source format support | JSON, YAML, TOML, CSV, MessagePack | JSON only |
| Runtime dependencies | **Zero** | 1 |
| Lossless round-trips verified | **33 billion+** | None published |
| Session deduplication | Yes (92% savings by 5th call) | No |
| Graph/relationship encoding | Yes (local IDs, typed edges) | No |

[Full comparison with benchmarks](https://gcformat.com/guide/vs-toon.html)

## How GCF Works

GCF replaces JSON's verbose syntax with a compact, deterministic encoding:

- No braces, brackets, or quotes for keys
- Tabular arrays encoded as pipe-separated rows
- Nested structures via indentation
- Zero config: `encodeGeneric(data)` and `decodeGeneric(text)` handle everything

The encoding is fully deterministic and round-trip safe.

## License

MIT
