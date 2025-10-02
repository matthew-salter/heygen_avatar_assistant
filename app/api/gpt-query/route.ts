import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { parseStringPromise } from "xml2js";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import OpenAI from "openai";

const {
  OPENAI_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CUSTOM_GPT_BUCKET,
  CUSTOM_GPT_FOLDER,
  CUSTOM_GPT_INSTRUCTIONS = "Instructions/instructions.txt",
  CUSTOM_GPT_KB_FOLDER = "Knowledge_Base",
} = process.env;

export async function POST(req: NextRequest) {
  try {
    if (
      !OPENAI_API_KEY ||
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY ||
      !CUSTOM_GPT_BUCKET ||
      !CUSTOM_GPT_FOLDER
    ) {
      return new Response(JSON.stringify({ error: "Missing env vars" }), {
        status: 500,
      });
    }

    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'message'." }),
        { status: 400 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Load instructions
    const instructionsPath = `${CUSTOM_GPT_FOLDER}/${CUSTOM_GPT_INSTRUCTIONS}`;
    const { data: instFile, error: instErr } = await supabase
      .storage
      .from(CUSTOM_GPT_BUCKET)
      .download(instructionsPath);

    if (instErr || !instFile) {
      return new Response(
        JSON.stringify({ error: "Instructions file not found." }),
        { status: 500 }
      );
    }
    const instructions = await instFile.text();

    // 2) List KB files
    const kbFolderPath = `${CUSTOM_GPT_FOLDER}/${CUSTOM_GPT_KB_FOLDER}`;
    const { data: kbFiles, error: kbErr } = await supabase
      .storage
      .from(CUSTOM_GPT_BUCKET)
      .list(kbFolderPath);

    if (kbErr || !kbFiles) {
      return new Response(
        JSON.stringify({ error: "Knowledge base folder not found." }),
        { status: 500 }
      );
    }

    // 3) Download & parse KB docs
    const docs: { name: string; text: string }[] = [];

    for (const f of kbFiles) {
      const filePath = `${kbFolderPath}/${f.name}`;
      const { data: fileRes } = await supabase
        .storage
        .from(CUSTOM_GPT_BUCKET)
        .download(filePath);

      if (!fileRes) continue;
      const lower = f.name.toLowerCase();

      try {
        if (lower.endsWith(".txt") || lower.endsWith(".md")) {
          const text = await fileRes.text();
          docs.push({ name: f.name, text });

        } else if (lower.endsWith(".pdf")) {
          // using pdfjs-dist here for real text extraction
          const buffer = Buffer.from(await fileRes.arrayBuffer());
          const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.js");

          const loadingTask = pdfjsLib.getDocument({ data: buffer });
          const pdf = await loadingTask.promise;

          let allText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map((item: any) => item.str).join(" ");
            allText += strings + "\n";
          }

          docs.push({ name: f.name, text: allText });

        } else if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
          const buffer = Buffer.from(await fileRes.arrayBuffer());
          const result = await mammoth.extractRawText({ buffer });
          docs.push({ name: f.name, text: result.value });

        } else if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) {
          const buffer = Buffer.from(await fileRes.arrayBuffer());
          const wb = XLSX.read(buffer, { type: "buffer" });
          const sheetName = wb.SheetNames[0];
          const sheet = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
          docs.push({ name: f.name, text: sheet });

        } else if (lower.endsWith(".csv")) {
          const text = await fileRes.text();
          const parsed = Papa.parse(text, { header: true });
          docs.push({ name: f.name, text: JSON.stringify(parsed.data) });

        } else if (lower.endsWith(".pptx") || lower.endsWith(".ppsx")) {
          const buffer = Buffer.from(await fileRes.arrayBuffer());
          const zip = await JSZip.loadAsync(buffer);

          let allText = "";
          const slideFiles = Object.keys(zip.files).filter((f) =>
            f.startsWith("ppt/slides/slide")
          );

          for (const slideName of slideFiles) {
            const slideXml = await zip.files[slideName].async("string");
            const parsed = await parseStringPromise(slideXml);
            const texts =
              parsed?.["p:sld"]?.["p:cSld"]?.[0]?.["p:spTree"]?.[0]?.["p:sp"]
                ?.map((s: any) =>
                  s["p:txBody"]
                    ? s["p:txBody"][0]["a:p"]
                        .map((p: any) =>
                          p["a:r"]
                            ? p["a:r"].map((r: any) => r["a:t"]).join(" ")
                            : ""
                        )
                        .join(" ")
                    : ""
                )
                .join(" ") || "";
            allText += texts + "\n";
          }

          docs.push({ name: f.name, text: allText });

        } else if (lower.endsWith(".xml")) {
          const raw = await fileRes.text();
          const parsed = await parseStringPromise(raw);
          docs.push({ name: f.name, text: JSON.stringify(parsed) });

        } else if (lower.endsWith(".json")) {
          const raw = await fileRes.text();
          docs.push({ name: f.name, text: raw });

        } else if (lower.endsWith(".rtf")) {
          const raw = await fileRes.text();
          const plain = raw
            .replace(/\\[a-z]+\d* ?/g, "")
            .replace(/[{}]/g, "")
            .replace(/\n+/g, "\n");
          docs.push({ name: f.name, text: plain });
        }
      } catch (e) {
        console.warn(`Failed to parse ${f.name}:`, e);
      }
    }

    // 4) Build context
    const contextText = docs
      .map((doc) => `---\n${doc.name}\n${doc.text}`)
      .join("\n\n");

    const systemPrompt =
      instructions +
      "\n\nRULE: If context is insufficient, ask a clarifying question.";

    const userPrompt = `${message}\n\nContext:\n${contextText}`;

    // 5) Call OpenAI
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    });

    const reply =
      completion.choices?.[0]?.message?.content ??
      "No reply generated by OpenAI.";

    return new Response(JSON.stringify({ reply }), { status: 200 });
  } catch (err: any) {
    console.error("GPT error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal Server Error" }),
      { status: 500 }
    );
  }
}