import { describe, it, expect } from "vitest";
import { AdapterConfigSchema } from "../../apps/gateway/src/adapters/schema.js";
import yaml from "yaml";

describe("Optional Models in Adapter Manifest", () => {
  it("successfully parses adapter config without models and provides default model", () => {
    const rawYaml = `
id: "simple-tool"
name: "Simple Tool CLI"
executable: "node"
execution_mode: "pipe"
invocation:
  args_template:
    - "-e"
    - "console.log('hello')"
`;

    const parsed = yaml.parse(rawYaml);
    const validated = AdapterConfigSchema.safeParse(parsed);

    expect(validated.success).toBe(true);
    if (validated.success) {
      expect(validated.data.models).toBeDefined();
      expect(validated.data.models.length).toBe(1);
      expect(validated.data.models[0].id).toBe("simple-tool");
      expect(validated.data.models[0].name).toBe("Simple Tool CLI Default Model");
      expect(validated.data.models[0].tier).toBe("medium");
      expect(validated.data.models[0].is_default).toBe(true);
    }
  });

  it("preserves explicit models when provided", () => {
    const rawYaml = `
id: "multi-model"
name: "Multi Model CLI"
executable: "node"
models:
  - id: "fast"
    name: "Fast Model"
    tier: "low"
    is_default: true
  - id: "deep"
    name: "Deep Model"
    tier: "high"
invocation:
  args_template:
    - "--model"
    - "{model}"
`;

    const parsed = yaml.parse(rawYaml);
    const validated = AdapterConfigSchema.safeParse(parsed);

    expect(validated.success).toBe(true);
    if (validated.success) {
      expect(validated.data.models.length).toBe(2);
      expect(validated.data.models[0].id).toBe("fast");
      expect(validated.data.models[1].id).toBe("deep");
    }
  });
});
