import { writeExamples } from "../src/examples.ts";
import { LOOKS } from "../src/studio/looks.ts";

try {
  const count = writeExamples();
  console.log(`Wrote ${count} files for ${LOOKS.length} looks to examples/`);
} catch (err: any) {
  console.error(err?.message ?? String(err));
  process.exit(1);
}
