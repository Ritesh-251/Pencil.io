import zlib from "zlib";

type CompressedPayload = {
  encoding: "gzip-base64";
  payload: string;
};

function isCompressedPayload(value: unknown): value is CompressedPayload {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { encoding?: unknown }).encoding === "gzip-base64" &&
    typeof (value as { payload?: unknown }).payload === "string"
  );
}

export function compressSnapshotData(data: unknown): CompressedPayload {
  const json = JSON.stringify(data);
  const buffer = zlib.gzipSync(json);

  return {
    encoding: "gzip-base64",
    payload: buffer.toString("base64"),
  };
}

export function decompressSnapshotData<T>(value: unknown): T {
  if (!isCompressedPayload(value)) {
    return value as T;
  }

  const raw = Buffer.from(value.payload, "base64");
  const json = zlib.gunzipSync(raw).toString();
  return JSON.parse(json) as T;
}
