import { streamText } from "ai";
import { PDFParse } from "pdf-parse";
import { google } from "@ai-sdk/google";
import { dirname, join, extname } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import mammoth from "mammoth";

export interface ConvertOptions {
  onProgress?: (message: string) => void;
  respectPages?: boolean;
}

export interface ConvertResult {
  outputPath: string;
  imagesSaved: number;
  imagesDeleted: number;
}

export async function convert(
  inputFilePath: string,
  outputPath: string,
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  const { onProgress = () => {}, respectPages = false } = options;

  if (!existsSync(inputFilePath)) {
    throw new Error(`File not found: ${inputFilePath}`);
  }

  const inputBuffer = await readFile(inputFilePath);

  const fileExtension = extname(inputFilePath).toLowerCase();
  const supportedExtensions = [".pdf", ".docx", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
  const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

  if (!supportedExtensions.includes(fileExtension)) {
    throw new Error(
      `Unsupported file type: ${fileExtension}. Supported: PDF (.pdf), DOCX (.docx), Images (.png, .jpg, .jpeg, .gif, .webp)`,
    );
  }

  onProgress(`Processing ${fileExtension.toUpperCase().slice(1)} file...`);

  const outputDir = dirname(outputPath);

  const savedImages: Array<{
    pageNumber: number;
    imageIndex: number;
    filename: string;
  }> = [];

  const pageContents: Array<{
    pageNumber: number;
    text: string;
    imageBase64: string | null;
    imageFilenames: string[];
  }> = [];

  if (fileExtension === ".pdf") {
    const parser = new PDFParse({ data: inputBuffer });

    onProgress("Extracting pages from PDF...");
    const { pages: screenshotPages } = await parser.getScreenshot({
      scale: 1.5,
    });
    const { pages: textPages } = await parser.getText();
    const { pages: imagePages } = await parser.getImage();

    await parser.destroy();

    onProgress(`Found ${screenshotPages.length} pages`);

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
            await writeFile(filepath, image.data);
            savedImages.push({
              pageNumber: pageIndex + 1,
              imageIndex,
              filename,
            });
            globalImageIndex++;
          }
        }
      }
    }

    onProgress(`Saved ${savedImages.length} images`);

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
  } else if (fileExtension === ".docx") {
    onProgress("Extracting content from DOCX...");

    const docxBuffer = inputBuffer;

    const textResult = await mammoth.extractRawText({ buffer: docxBuffer });
    const rawText = textResult.value;

    let globalImageIndex = 0;
    const imageOptions = {
      convertImage: mammoth.images.imgElement(
        async (image: {
          read: (encoding: "base64") => Promise<string>;
          contentType: string;
        }) => {
          const imageBuffer = Buffer.from(await image.read("base64"), "base64");
          const extension = image.contentType.split("/")[1] || "png";
          const filename = `image_${globalImageIndex + 1}.${extension}`;
          const filepath = join(outputDir, filename);
          await writeFile(filepath, imageBuffer);
          savedImages.push({
            pageNumber: 1,
            imageIndex: globalImageIndex,
            filename,
          });
          globalImageIndex++;
          return { src: filename };
        },
      ),
    };

    const resultWithImages = await mammoth.convertToHtml(
      { buffer: docxBuffer },
      imageOptions,
    );
    const htmlWithImages = resultWithImages.value;

    onProgress(`Saved ${savedImages.length} images`);

    pageContents.push({
      pageNumber: 1,
      text: `HTML Content:\n${htmlWithImages}\n\nRaw Text:\n${rawText}`,
      imageBase64: null,
      imageFilenames: savedImages.map((img) => img.filename),
    });
  } else if (imageExtensions.includes(fileExtension)) {
    onProgress("Processing image file for text extraction...");

    const mimeTypeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };

    const mimeType = mimeTypeMap[fileExtension] || "image/png";
    const imageBase64 = inputBuffer.toString("base64");

    pageContents.push({
      pageNumber: 1,
      text: "",
      imageBase64,
      imageFilenames: [],
    });

    // Store the mime type for later use
    (pageContents[0] as { mimeType?: string }).mimeType = mimeType;
  }

  let initialInstruction: string;
  const isImageFile = imageExtensions.includes(fileExtension);

  if (isImageFile) {
    initialInstruction =
      "Extract all text content from the following image and convert it to a well-formatted Markdown document. Accurately capture all text, preserving structure including headings, lists, tables, and any formatting visible in the image. If the image contains diagrams, charts, or non-text elements, describe them briefly. Output ONLY the markdown content, no explanations.";
  } else if (fileExtension === ".docx") {
    initialInstruction =
      "Convert the following DOCX document content to a well-formatted Markdown document. I will provide the extracted HTML and raw text content. Convert this to clean Markdown, preserving the structure including headings, lists, tables, and any special formatting. I have also extracted embedded images from the document and saved them as separate files. Include images in the markdown using the format ![alt text](filename). Output ONLY the markdown content, no explanations.";
  } else {
    initialInstruction = respectPages
      ? "Convert the following PDF pages to a well-formatted Markdown document. For each page, I will provide the extracted text and a screenshot image. Use the screenshot to understand the visual layout, tables, and formatting. I have also extracted embedded images from the PDF and saved them as separate files. If you see references to images in the text or screenshots, include them in the markdown using the format ![alt text](filename). Preserve the structure including headings, lists, tables, and any special formatting. Output ONLY the markdown content, no explanations."
      : "Convert the following PDF pages to a well-formatted Markdown document. Do NOT treat each page as a separate section: ignore repeated headers and footers that appear on every page and merge content into a single continuous document. Use the screenshots to understand visual layout, tables, and formatting. I have also extracted embedded images from the PDF and saved them as separate files. If you see references to images in the text or screenshots, include them in the markdown using the format ![alt text](filename). Do NOT insert horizontal rules (---) between pages. Preserve structure including headings, lists, tables, and any special formatting. Output ONLY the markdown content, no explanations.";
  }

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
    // For image files, skip the page header text
    if (!isImageFile) {
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
    }

    if (page.imageBase64) {
      const pageMimeType = (page as { mimeType?: string }).mimeType || "image/png";
      userContent.push({
        type: "image",
        image: page.imageBase64,
        mimeType: pageMimeType,
      });
    }
  }

  onProgress(isImageFile ? "Extracting text from image with AI..." : "Converting to markdown with AI...");

  const result = streamText({
    model: google("gemini-2.5-flash"),
    messages: [
      {
        role: "system",
        content: isImageFile
          ? "You are an expert at extracting text from images (OCR) and converting it to clean, well-structured Markdown. You accurately capture all visible text while preserving structure including headings, lists, tables, and formatting. You use proper Markdown syntax including tables with pipes and dashes, headers with #, lists with - or *, and code blocks with backticks when appropriate."
          : "You are an expert at converting PDF and DOCX content to clean, well-structured Markdown. You accurately preserve tables, headings, lists, and formatting. You use proper Markdown syntax including tables with pipes and dashes, headers with #, lists with - or *, and code blocks with backticks when appropriate.",
      },
      {
        role: "user",
        content: userContent,
      },
    ],
  });

  let markdownContent = "";

  for await (const chunk of result.textStream) {
    markdownContent += chunk;
  }

  await writeFile(outputPath, markdownContent);

  onProgress("Cleaning up unused images...");

  const markdownText = markdownContent;

  const imageRegex = /!\[.*?\]\(([^)]+\.(png|jpg|jpeg|gif|webp))\)/gi;
  const usedImages = new Set<string>();
  let match;

  while ((match = imageRegex.exec(markdownText)) !== null) {
    if (match[1]) {
      usedImages.add(match[1]);
    }
  }

  let deletedCount = 0;
  for (const imageInfo of savedImages) {
    const imagePath = join(outputDir, imageInfo.filename);

    if (existsSync(imagePath) && !usedImages.has(imageInfo.filename)) {
      try {
        unlinkSync(imagePath);
        deletedCount++;
      } catch {
        // Ignore deletion errors
      }
    }
  }

  return {
    outputPath,
    imagesSaved: savedImages.length,
    imagesDeleted: deletedCount,
  };
}
