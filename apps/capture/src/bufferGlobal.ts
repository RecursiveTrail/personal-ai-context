import { Buffer } from "buffer";

// gray-matter (used by pack-core/parse) calls the global Buffer, which browsers lack.
globalThis.Buffer = Buffer;
