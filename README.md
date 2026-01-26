# file-to-markdown

Convert PDF and DOCX files to Markdown using AI. This CLI tool extracts text, images, and preserves table structure while converting documents to clean, well-formatted Markdown.

## Features

- **PDF Support** - Full text extraction, image extraction, and page screenshots for layout understanding
- **DOCX Support** - Text and image extraction with structure preservation
- **AI-Powered Conversion** - Uses Google's Gemini AI to intelligently convert content to Markdown
- **Interactive CLI** - Friendly prompts using clack.js
- **Easy Setup** - Built-in configuration wizard for API keys

## Installation

### Using npx (no installation required)

```bash
npx file-to-markdown document.pdf
```

### Using bunx

```bash
bunx file-to-markdown document.pdf
```

### Using pnpm dlx

```bash
pnpm dlx file-to-markdown document.pdf
```

### Global installation

```bash
npm install -g file-to-markdown
# or
bun install -g file-to-markdown
```

## Setup

Before using the tool, you need to configure your Google AI API key.

### Run the setup wizard

```bash
file-to-markdown setup
# or with npx
npx file-to-markdown setup
```

The setup wizard will:
1. Show you where to get a Google AI API key (https://aistudio.google.com/apikey)
2. Prompt you to enter your API key
3. Ask where to save it (local project or global for all projects)

### Manual setup

Alternatively, set the environment variable:

```bash
export GOOGLE_GENERATIVE_AI_API_KEY="your-api-key-here"
```

Or create a `.env` file in your project:

```
GOOGLE_GENERATIVE_AI_API_KEY=your-api-key-here
```

## Usage

### Interactive Mode

```bash
file-to-markdown
```

The tool will prompt you for:
- Input file path
- Output file path

### CLI Mode

```bash
# Convert with auto-generated output name
file-to-markdown document.pdf

# Convert with custom output path
file-to-markdown document.pdf output.md

# Using the short alias
f2md document.pdf
```

### Supported File Types

- PDF (`.pdf`)
- Word Documents (`.docx`)

## Options

```bash
file-to-markdown --help     # Show help
file-to-markdown --version  # Show version
file-to-markdown setup      # Configure API key
```

## How It Works

1. **Extraction** - Reads the input file and extracts text, images, and layout information
2. **Processing** - For PDFs, captures page screenshots to understand visual layout
3. **AI Conversion** - Sends extracted content to Google's Gemini AI model
4. **Markdown Generation** - Receives AI-generated Markdown with proper formatting
5. **Cleanup** - Removes unused images and saves the final output

## Development

### Prerequisites

- [Bun](https://bun.sh) installed

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd file-to-markdown

# Install dependencies
bun install

# Run in development mode
bun run dev
```

### Build

```bash
bun run build
```

### Project Structure

```
src/
  cli.ts      - CLI entry point with clack prompts
  convert.ts  - Core conversion logic
  index.ts    - Public API exports
dist/         - Built output (generated)
```

## API Usage

You can also use this as a library in your Node.js/Bun projects:

```typescript
import { convert } from "file-to-markdown";

const result = await convert("input.pdf", "output.md", {
  onProgress: (message) => console.log(message),
  respectPages: false,
});

console.log(`Saved to: ${result.outputPath}`);
console.log(`Images saved: ${result.imagesSaved}`);
console.log(`Images cleaned: ${result.imagesDeleted}`);
```

## License

MIT
