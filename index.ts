import { streamText } from "ai";
import { PDFParse } from "pdf-parse";
import { google } from "@ai-sdk/google";

// Get PDF file path from command line arguments
const args = Bun.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: bun run index.ts <pdf-file-path> [output-path]");
  process.exit(1);
}

const pdfFilePath = args[0]!;
// Optional second argument is treated as the output path for the generated Markdown
const outputPathArg = args[1]?.trim();
const outputPathDefault = "output.md";
const outputPath =
  outputPathArg && outputPathArg.length > 0 ? outputPathArg : outputPathDefault;

const pdfFile = Bun.file(pdfFilePath);

if (!(await pdfFile.exists())) {
  console.error(`Error: File not found: ${pdfFilePath}`);
  process.exit(1);
}

console.log(`Processing PDF: ${pdfFilePath}`);

// Parse the PDF
const parser = new PDFParse({ data: await pdfFile.arrayBuffer() });

// Get screenshots of all pages
const { pages: screenshotPages } = await parser.getScreenshot({ scale: 1.5 });

// Get text content from all pages
const { pages: textPages } = await parser.getText();

await parser.destroy();

console.log(`Found ${screenshotPages.length} pages`);

// Prepare content for LLM - combine text and images for each page
const pageContents: Array<{
  pageNumber: number;
  text: string;
  imageBase64: string | null;
}> = [];

for (let i = 0; i < screenshotPages.length; i++) {
  const screenshot = screenshotPages[i];
  const textPage = textPages[i];

  pageContents.push({
    pageNumber: i + 1,
    text: textPage?.text || "",
    imageBase64: screenshot?.data
      ? Buffer.from(screenshot.data).toString("base64")
      : null,
  });
}

// Respect page boundaries and headers/footers.
// If set to false, the LLM should ignore repeated headers/footers across pages
// and should not insert horizontal rules (---) between pages.
const respectPages = false;

// Build the message content with images and text for each page
const initialInstruction = respectPages
  ? "Convert the following PDF pages to a well-formatted Markdown document. For each page, I will provide the extracted text and a screenshot image. Use the screenshot to understand the visual layout, tables, and formatting. Preserve the structure including headings, lists, tables, and any special formatting. Output ONLY the markdown content, no explanations."
  : "Convert the following PDF pages to a well-formatted Markdown document. Do NOT treat each page as a separate section: ignore repeated headers and footers that appear on every page and merge content into a single continuous document. Use the screenshots to understand visual layout, tables, and formatting. Do NOT insert horizontal rules (---) between pages. Preserve structure including headings, lists, tables, and any special formatting. Output ONLY the markdown content, no explanations.";

const userContent: Array<
  | { type: "text"; text: string }
  | { type: "image"; image: string; mimeType: string }
> = [
  {
    type: "text",
    text: initialInstruction,
  },
];

for (const page of pageContents) {
  userContent.push({
    type: "text",
    text: `\n--- Page ${page.pageNumber} ---\nExtracted text:\n${
      page.text || "(No text extracted)"
    }`,
  });

  if (page.imageBase64) {
    userContent.push({
      type: "image",
      image: page.imageBase64,
      mimeType: "image/png",
    });
  }
}

console.log("Sending to LLM for markdown conversion...");

// Stream the response from the LLM
const result = streamText({
  model: google("gemini-2.5-flash"),
  messages: [
    {
      role: "system",
      content:
        "You are an expert at converting PDF content to clean, well-structured Markdown. You accurately preserve tables, headings, lists, and formatting. You use proper Markdown syntax including tables with pipes and dashes, headers with #, lists with - or *, and code blocks with backticks when appropriate.",
    },
    {
      role: "user",
      content: userContent,
    },
  ],
});

// Collect the streamed response
let markdownContent = "";

process.stdout.write("Generating markdown");

for await (const chunk of result.textStream) {
  markdownContent += chunk;
  process.stdout.write(".");
}

console.log("\n");

// Use the resolved outputPath (either provided by the user or the default)
await Bun.write(outputPath, markdownContent);

console.log(`✅ Markdown saved to ${outputPath}`);
