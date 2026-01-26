#!/usr/bin/env node
import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { extname, basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { convert } from "./convert";

const VERSION = "1.0.0";

function showHelp() {
  console.log(`
f2md v${VERSION}

Convert PDF and DOCX files to Markdown using AI.

Usage:
  f2md [input-file] [output-file]
  f2md [input-file] [output-file]

Examples:
  f2md                      # Interactive mode
  f2md document.pdf         # Convert to document.md
  f2md doc.pdf output.md    # Convert to output.md

Commands:
  setup                                 # Configure Google AI API key

Options:
  -h, --help     Show this help message
  -v, --version  Show version number

Environment Variables:
  GOOGLE_GENERATIVE_AI_API_KEY  Required. Your Google AI API key.
`);
}

async function runSetup() {
  p.intro("Setup f2md");

  const envPath = join(process.cwd(), ".env");
  const globalEnvPath = join(homedir(), ".f2md.env");

  // Check if .env already exists
  const hasLocalEnv = existsSync(envPath);
  const hasGlobalEnv = existsSync(globalEnvPath);

  if (hasLocalEnv) {
    const fileContent = await readFile(envPath, "utf8");
    if (fileContent.includes("GOOGLE_GENERATIVE_AI_API_KEY")) {
      p.note(
        `Found existing configuration in:\n${envPath}`,
        "Already configured",
      );

      const shouldOverwrite = await p.confirm({
        message: "Do you want to update your API key?",
        initialValue: false,
      });

      if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
        p.cancel("Setup cancelled");
        process.exit(0);
      }
    }
  } else if (hasGlobalEnv) {
    p.note(
      `Found existing global configuration in:\n${globalEnvPath}`,
      "Already configured",
    );

    const shouldOverwrite = await p.confirm({
      message: "Do you want to update your API key?",
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

  const scope = await p.select({
    message: "Where should the API key be saved?",
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
  const envContent = `GOOGLE_GENERATIVE_AI_API_KEY=${apiKey}\n`;

  try {
    await writeFile(targetPath, envContent);
    p.note(`API key saved to:\n${targetPath}`, "Setup complete");
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

async function getApiKey(): Promise<string | undefined> {
  // Check environment variable
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  }

  // Check local .env
  const localEnvPath = join(process.cwd(), ".env");
  if (existsSync(localEnvPath)) {
    const content = await readFile(localEnvPath, "utf8");
    const match = content.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.+)/);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  // Check global .env
  const globalEnvPath = join(homedir(), ".f2md.env");
  if (existsSync(globalEnvPath)) {
    const content = await readFile(globalEnvPath, "utf8");
    const match = content.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.+)/);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
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

  if (args[0] === "setup") {
    await runSetup();
    process.exit(0);
  }

  // Check for API key before proceeding
  const apiKey = await getApiKey();
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

  // Set the API key in the environment for the convert function
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey;

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
    p.cancel(
      `Unsupported file type: ${fileExtension}. Only PDF and DOCX files are supported.`,
    );
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
      "Conversion complete",
    );

    p.outro("Done!");
  } catch (error) {
    spinner.stop("Conversion failed");
    p.cancel(error instanceof Error ? error.message : "Unknown error occurred");
    process.exit(1);
  }
}

main();
