#!/usr/bin/env node
import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { extname, basename, dirname, join } from "node:path";
import { convert } from "./convert";

const VERSION = "1.0.0";

function showHelp() {
  console.log(`
file-to-markdown v${VERSION}

Convert PDF and DOCX files to Markdown using AI.

Usage:
  file-to-markdown [input-file] [output-file]
  f2md [input-file] [output-file]

Examples:
  file-to-markdown                      # Interactive mode
  file-to-markdown document.pdf         # Convert to document.md
  file-to-markdown doc.pdf output.md    # Convert to output.md

Options:
  -h, --help     Show this help message
  -v, --version  Show version number

Environment Variables:
  GOOGLE_GENERATIVE_AI_API_KEY  Required. Your Google AI API key.
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Handle flags
  if (args.includes("-h") || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  if (args.includes("-v") || args.includes("--version")) {
    console.log(VERSION);
    process.exit(0);
  }

  p.intro("file-to-markdown");

  let inputFilePath: string;
  let outputPath: string | undefined;

  // Check if arguments were provided via CLI
  if (args.length > 0 && args[0] && !args[0].startsWith("-")) {
    inputFilePath = args[0];
    outputPath = args[1];
  } else {
    // Interactive mode
    const inputResult = await p.text({
      message: "Enter the path to your PDF or DOCX file:",
      placeholder: "./document.pdf",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Please enter a file path";
        }
        if (!existsSync(value.trim())) {
          return `File not found: ${value}`;
        }
        const ext = extname(value.trim()).toLowerCase();
        if (![".pdf", ".docx"].includes(ext)) {
          return "Only PDF and DOCX files are supported";
        }
      },
    });

    if (p.isCancel(inputResult)) {
      p.cancel("Operation cancelled");
      process.exit(0);
    }

    inputFilePath = inputResult as string;

    // Suggest default output path
    const inputBasename = basename(inputFilePath, extname(inputFilePath));
    const inputDir = dirname(inputFilePath);
    const suggestedOutput = join(inputDir, `${inputBasename}.md`);

    const outputResult = await p.text({
      message: "Enter the output path for the markdown file:",
      placeholder: suggestedOutput,
      defaultValue: suggestedOutput,
    });

    if (p.isCancel(outputResult)) {
      p.cancel("Operation cancelled");
      process.exit(0);
    }

    outputPath = (outputResult as string) || suggestedOutput;
  }

  // Validate the input file
  if (!existsSync(inputFilePath)) {
    p.cancel(`File not found: ${inputFilePath}`);
    process.exit(1);
  }

  const fileExtension = extname(inputFilePath).toLowerCase();
  if (![".pdf", ".docx"].includes(fileExtension)) {
    p.cancel(`Unsupported file type: ${fileExtension}. Only PDF and DOCX files are supported.`);
    process.exit(1);
  }

  // Set default output path if not provided
  if (!outputPath || outputPath.trim().length === 0) {
    const inputBasename = basename(inputFilePath, extname(inputFilePath));
    const inputDir = dirname(inputFilePath);
    outputPath = join(inputDir, `${inputBasename}.md`);
  }

  const spinner = p.spinner();

  spinner.start(`Processing ${fileExtension.toUpperCase().slice(1)} file...`);

  try {
    const result = await convert(inputFilePath, outputPath, {
      onProgress: (message: string) => {
        spinner.message(message);
      },
    });

    spinner.stop(`Converted ${basename(inputFilePath)}`);

    p.note(
      [
        `Output: ${result.outputPath}`,
        `Images saved: ${result.imagesSaved}`,
        `Images cleaned up: ${result.imagesDeleted}`,
      ].join("\n"),
      "Conversion complete"
    );

    p.outro("Done!");
  } catch (error) {
    spinner.stop("Conversion failed");
    p.cancel(error instanceof Error ? error.message : "Unknown error occurred");
    process.exit(1);
  }
}

main();
