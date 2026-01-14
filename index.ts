import { streamText } from "ai";
import { PDFParse } from "pdf-parse";
import { google } from "@ai-sdk/google";
import { dirname, join } from "node:path";
import { existsSync, unlinkSync } from "node:fs";

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

// Get embedded images from all pages
const { pages: imagePages } = await parser.getImage();

await parser.destroy();

console.log(`Found ${screenshotPages.length} pages`);

// Determine output directory
const outputDir = dirname(outputPath);

// Save extracted images
const savedImages: Array<{
  pageNumber: number;
  imageIndex: number;
  filename: string;
}> = [];
let globalImageIndex = 0;

for (let pageIndex = 0; pageIndex < imagePages.length; pageIndex++) {
  const pageImages = imagePages[pageIndex];
  if (pageImages && pageImages.images) {
    for (
      let imageIndex = 0;
      imageIndex < pageImages.images.length;
      imageIndex++
    ) {
      const image = pageImages.images[imageIndex];
      if (image && image.data) {
        const filename = `image_${globalImageIndex + 1}.png`;
        const filepath = join(outputDir, filename);
        await Bun.write(filepath, image.data);
        savedImages.push({
          pageNumber: pageIndex + 1,
          imageIndex,
          filename,
        });
        globalImageIndex++;
        console.log(`Saved image: ${filename}`);
      }
    }
  }
}

console.log(`Saved ${savedImages.length} images`);

// Prepare content for LLM - combine text and images for each page
const pageContents: Array<{
  pageNumber: number;
  text: string;
  imageBase64: string | null;
  imageFilenames: string[];
}> = [];

for (let i = 0; i < screenshotPages.length; i++) {
  const screenshot = screenshotPages[i];
  const textPage = textPages[i];
  const pageImages = savedImages.filter((img) => img.pageNumber === i + 1);

  pageContents.push({
    pageNumber: i + 1,
    text: textPage?.text || "",
    imageBase64: screenshot?.data
      ? Buffer.from(screenshot.data).toString("base64")
      : null,
    imageFilenames: pageImages.map((img) => img.filename),
  });
}

// Respect page boundaries and headers/footers.
// If set to false, the LLM should ignore repeated headers/footers across pages
// and should not insert horizontal rules (---) between pages.
const respectPages = false;

// Build the message content with images and text for each page
const initialInstruction = respectPages
  ? "Convert the following PDF pages to a well-formatted Markdown document. For each page, I will provide the extracted text and a screenshot image. Use the screenshot to understand the visual layout, tables, and formatting. I have also extracted embedded images from the PDF and saved them as separate files. If you see references to images in the text or screenshots, include them in the markdown using the format ![alt text](filename). Preserve the structure including headings, lists, tables, and any special formatting. Output ONLY the markdown content, no explanations."
  : "Convert the following PDF pages to a well-formatted Markdown document. Do NOT treat each page as a separate section: ignore repeated headers and footers that appear on every page and merge content into a single continuous document. Use the screenshots to understand visual layout, tables, and formatting. I have also extracted embedded images from the PDF and saved them as separate files. If you see references to images in the text or screenshots, include them in the markdown using the format ![alt text](filename). Do NOT insert horizontal rules (---) between pages. Preserve structure including headings, lists, tables, and any special formatting. Output ONLY the markdown content, no explanations.";

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
    }${
      page.imageFilenames.length > 0
        ? `\n\nExtracted images on this page: ${page.imageFilenames.join(", ")}`
        : ""
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

// Clean up unused images
console.log("Cleaning up unused images...");

// Read the generated markdown content
const markdownFile = Bun.file(outputPath);
const markdownText = await markdownFile.text();

// Extract all image references from markdown using regex
// Matches ![alt text](filename.png) patterns
const imageRegex = /!\[.*?\]\(([^)]+\.png)\)/g;
const usedImages = new Set<string>();
let match;

while ((match = imageRegex.exec(markdownText)) !== null) {
  if (match[1]) {
    usedImages.add(match[1]); // filename is in capture group 1
  }
}

console.log(`Found ${usedImages.size} image references in markdown`);

// Get all saved image files
let deletedCount = 0;
for (const imageInfo of savedImages) {
  const imagePath = join(outputDir, imageInfo.filename);

  // Check if image exists and is not used in markdown
  if (existsSync(imagePath) && !usedImages.has(imageInfo.filename)) {
    try {
      unlinkSync(imagePath);
      deletedCount++;
      console.log(`Deleted unused image: ${imageInfo.filename}`);
    } catch (error) {
      console.warn(`Failed to delete ${imageInfo.filename}:`, error);
    }
  }
}

console.log(`✅ Cleaned up ${deletedCount} unused images`);
