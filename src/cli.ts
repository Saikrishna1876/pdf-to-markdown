#!/usr/bin/env node
import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { extname, basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { convert } from "./convert";

const VERSION = "1.2.0";
const DEFAULT_MODEL = "gemini-2.5-flash";
const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

function getEnvValue(content: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*(.+)\\s*$`, "m"));

  if (!match?.[1]) {
    return undefined;
  }

  let value = match[1].trim();

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return value || undefined;
}

function showHelp() {
  console.log(`
f2md v${VERSION}

Convert PDF, DOCX, and image files to Markdown using AI.

Usage:
  f2md [input-file] [output-file]

Examples:
  f2md                      # Interactive mode
  f2md document.pdf         # Convert to document.md
  f2md doc.pdf output.md    # Convert to output.md
  f2md image.png            # Extract text from image to image.md

Commands:
  setup                                 # Configure Google AI API key and model

Options:
  -h, --help           Show this help message
  -v, --version        Show version number
  -p, --respect-pages  Treat each PDF page as a separate section (default: merge into single document)

Supported file types:
  - PDF (.pdf)
  - DOCX (.docx)
  - Images (.png, .jpg, .jpeg, .gif, .webp) - OCR text extraction

Environment Variables:
  GOOGLE_GENERATIVE_AI_API_KEY  Required. Your Google AI API key.
  GOOGLE_GENERATIVE_AI_MODEL    Optional. Gemini model to use (default: ${DEFAULT_MODEL}).
`);
}

async function runSetup() {
  p.intro("Setup f2md");

  const envPath = join(process.cwd(), ".env");
  const globalEnvPath = join(homedir(), ".f2md.env");

  // Check if .env already exists
  const hasLocalEnv = existsSync(envPath);
  const hasGlobalEnv = existsSync(globalEnvPath);

  let existingModel = process.env.GOOGLE_GENERATIVE_AI_MODEL || DEFAULT_MODEL;

  if (hasLocalEnv) {
    const fileContent = await readFile(envPath, "utf8");
    existingModel = getEnvValue(fileContent, "GOOGLE_GENERATIVE_AI_MODEL") || existingModel;

    if (
      fileContent.includes("GOOGLE_GENERATIVE_AI_API_KEY") ||
      fileContent.includes("GOOGLE_GENERATIVE_AI_MODEL")
    ) {
      p.note(
        `Found existing configuration in:\n${envPath}`,
        "Already configured",
      );

      const shouldOverwrite = await p.confirm({
        message: "Do you want to update your configuration?",
        initialValue: false,
      });

      if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
        p.cancel("Setup cancelled");
        process.exit(0);
      }
    }
  } else if (hasGlobalEnv) {
    const fileContent = await readFile(globalEnvPath, "utf8");
    existingModel = getEnvValue(fileContent, "GOOGLE_GENERATIVE_AI_MODEL") || existingModel;

    p.note(
      `Found existing global configuration in:\n${globalEnvPath}`,
      "Already configured",
    );

    const shouldOverwrite = await p.confirm({
      message: "Do you want to update your configuration?",
      initialValue: false,
    });

    if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
      p.cancel("Setup cancelled");
      process.exit(0);
    }
  }

  p.note(
    "To get your Google AI API key:\n" +
      "1. Visit: https://aistudio.google.com/apikey\n" +
      "2. Sign in with your Google account\n" +
      "3. Click 'Create API Key'\n" +
      "4. Copy the generated key",
    "How to get an API key",
  );

  const apiKey = await p.password({
    message: "Enter your Google AI API key:",
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "API key is required";
      }
      if (value.trim().length < 20) {
        return "API key seems too short. Please check and try again.";
      }
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel("Setup cancelled");
    process.exit(0);
  }

  const model = await p.text({
    message: "Enter the Gemini model to use:",
    placeholder: DEFAULT_MODEL,
    defaultValue: existingModel,
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "Model name is required";
      }
    },
  });

  if (p.isCancel(model)) {
    p.cancel("Setup cancelled");
    process.exit(0);
  }

  const scope = await p.select({
    message: "Where should this configuration be saved?",
    options: [
      {
        value: "local",
        label: "Current directory (.env)",
        hint: "Only for this project",
      },
      {
        value: "global",
        label: `Home directory (~/.f2md.env)`,
        hint: "For all projects",
      },
    ],
  });

  if (p.isCancel(scope)) {
    p.cancel("Setup cancelled");
    process.exit(0);
  }

  const targetPath = scope === "global" ? globalEnvPath : envPath;
  const envContent = `GOOGLE_GENERATIVE_AI_API_KEY=${apiKey}\nGOOGLE_GENERATIVE_AI_MODEL=${String(model).trim()}\n`;

  try {
    await writeFile(targetPath, envContent);
    p.note(`Configuration saved to:\n${targetPath}`, "Setup complete");
    p.outro("You can now run: f2md document.pdf");
  } catch (error) {
    p.cancel(
      error instanceof Error
        ? `Failed to save configuration: ${error.message}`
        : "Failed to save configuration",
    );
    process.exit(1);
  }
}

async function getConfig(): Promise<{ apiKey?: string; model: string }> {
  let apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  let model = process.env.GOOGLE_GENERATIVE_AI_MODEL;

  // Check local .env
  const localEnvPath = join(process.cwd(), ".env");
  if (existsSync(localEnvPath)) {
    const content = await readFile(localEnvPath, "utf8");
    apiKey = apiKey || getEnvValue(content, "GOOGLE_GENERATIVE_AI_API_KEY");
    model = model || getEnvValue(content, "GOOGLE_GENERATIVE_AI_MODEL");
  }

  // Check global .env
  const globalEnvPath = join(homedir(), ".f2md.env");
  if (existsSync(globalEnvPath)) {
    const content = await readFile(globalEnvPath, "utf8");
    apiKey = apiKey || getEnvValue(content, "GOOGLE_GENERATIVE_AI_API_KEY");
    model = model || getEnvValue(content, "GOOGLE_GENERATIVE_AI_MODEL");
  }

  return {
    apiKey,
    model: model || DEFAULT_MODEL,
  };
}

async function main() {
  const args = process.argv.slice(2);

  // Handle flags and commands
  if (args.includes("-h") || args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  if (args.includes("-v") || args.includes("--version")) {
    console.log(VERSION);
    process.exit(0);
  }

  const respectPages = args.includes("-p") || args.includes("--respect-pages");

  if (args[0] === "setup") {
    await runSetup();
    process.exit(0);
  }

  // Check for API key before proceeding
  const { apiKey, model } = await getConfig();
  if (!apiKey) {
    p.intro("f2md");
    p.cancel(
      "Google AI API key not found.\n\n" +
        "Run setup to configure your API key:\n" +
        "  f2md setup\n\n" +
        "Or set the GOOGLE_GENERATIVE_AI_API_KEY environment variable.",
    );
    process.exit(1);
  }

  // Set configuration in the environment for the convert function
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey;
  process.env.GOOGLE_GENERATIVE_AI_MODEL = model;

  p.intro("f2md");

  let inputFilePath: string;
  let outputPath: string | undefined;

  // Check if arguments were provided via CLI
  if (args.length > 0 && args[0] && !args[0].startsWith("-")) {
    inputFilePath = args[0];
    outputPath = args[1];
  } else {
    // Interactive mode
    const inputResult = await p.text({
      message: "Enter the path to your file (PDF, DOCX, or image):",
      placeholder: "./document.pdf",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Please enter a file path";
        }
        if (!existsSync(value.trim())) {
          return `File not found: ${value}`;
        }
        const ext = extname(value.trim()).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
          return "Supported formats: PDF, DOCX, PNG, JPG, JPEG, GIF, WEBP";
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
  if (!SUPPORTED_EXTENSIONS.includes(fileExtension)) {
    p.cancel(
      `Unsupported file type: ${fileExtension}. Supported formats: PDF, DOCX, PNG, JPG, JPEG, GIF, WEBP`,
    );
    process.exit(1);
  }

  const isImageFile = IMAGE_EXTENSIONS.includes(fileExtension);

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
      respectPages,
      model,
    });

    spinner.stop(`Converted ${basename(inputFilePath)}`);

    const noteLines = [`Output: ${result.outputPath}`];
    if (!isImageFile) {
      noteLines.push(`Images saved: ${result.imagesSaved}`);
      noteLines.push(`Images cleaned up: ${result.imagesDeleted}`);
    }

    p.note(
      noteLines.join("\n"),
      isImageFile ? "Text extraction complete" : "Conversion complete",
    );

    p.outro("Done!");
  } catch (error) {
    spinner.stop("Conversion failed");
    p.cancel(error instanceof Error ? error.message : "Unknown error occurred");
    process.exit(1);
  }
}

main();
