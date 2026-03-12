import type { MultipartFilePart, NormalizedBody } from "@/src/server/types/contracts";
import { tryParseJson } from "@/src/server/utils/json";

export function normalizeJsonBody(value: unknown): NormalizedBody {
  return { kind: "json", value };
}

export function normalizeTextBody(value: string): NormalizedBody {
  return { kind: "text", value };
}

export function normalizeFormData(formData: FormData): NormalizedBody {
  const fields: Record<string, string> = {};
  const files: MultipartFilePart[] = [];

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      fields[key] = value;
      continue;
    }
    files.push({
      fieldName: key,
      filename: value.name,
      mimeType: value.type || undefined,
      sizeBytes: value.size,
    });
  }

  return {
    kind: "multipart",
    fields,
    files,
  };
}

export async function normalizeRequestBody(
  request: Request,
): Promise<{ body?: NormalizedBody; rawBody?: string }> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const clone = request.clone();

  if (contentType.includes("multipart/form-data")) {
    return { body: normalizeFormData(await clone.formData()) };
  }

  const rawBody = await clone.text();
  if (!rawBody) {
    return {};
  }
  if (contentType.includes("application/json")) {
    const parsed = tryParseJson(rawBody);
    return {
      body: parsed !== undefined ? normalizeJsonBody(parsed) : normalizeTextBody(rawBody),
      rawBody,
    };
  }

  const parsed = tryParseJson(rawBody);
  return {
    body: parsed !== undefined ? normalizeJsonBody(parsed) : normalizeTextBody(rawBody),
    rawBody,
  };
}

export async function normalizeResponseBody(
  response: Response,
): Promise<{ body?: NormalizedBody; rawBody?: string }> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const rawBody = await response.clone().text();
  if (!rawBody) {
    return {};
  }
  if (contentType.includes("application/json")) {
    const parsed = tryParseJson(rawBody);
    return {
      body: parsed !== undefined ? normalizeJsonBody(parsed) : normalizeTextBody(rawBody),
      rawBody,
    };
  }
  const parsed = tryParseJson(rawBody);
  return {
    body: parsed !== undefined ? normalizeJsonBody(parsed) : normalizeTextBody(rawBody),
    rawBody,
  };
}
