import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { parseStringPromise } from "xml2js";
import JSZip from "jszip";
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

const MAX_DOC_LENGTH = 4000; // limit per doc

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
          docs.push({ name: f.name, text: text.slice(0, MAX_DOC_LENGTH) });

        } else if (lower.endsWith(".pdf")) {
          const buffer = Buffer.from(await fileRes.arrayBuffer());
          const parsed = await pdfParse(buffer);
          docs.push({ name: f.name, text: parsed.text.slice(0, MAX_DOC_LENGTH) });

        } else if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
          const buffer = Buffer.from(await fileRes.arrayBuffer());
          const result = await mammoth.extractRawText({ buffer });
          docs.push({ name: f.name, text: result.value.slice(0, MAX_DOC_LENGTH) });

        } else if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) {
          const buffer = Buffer.from(await fileRes.arrayBuffer());
          const wb = XLSX.read(buffer, { type: "buffer" });
          const sheetName = wb.SheetNames[0];
          const sheet = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
          docs.push({ name: f.name, text: sheet.slice(0, MAX_DOC_LENGTH) });

        } else if (lower.endsWith(".csv")) {
          const text = await fileRes.text();
          const parsed = Papa.parse(text, { header: true });
          docs.push({
            name: f.name,
            text: JSON.stringify(parsed.data).slice(0, MAX_DOC_LENGTH),
          });

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

          docs.push({
            name: f.name,
            text: allText.slice(0, MAX_DOC_LENGTH),
          });

        } else if (lower.endsWith(".xml")) {
          const raw = await fileRes.text();
          const parsed = await parseStringPromise(raw);
          docs.push({
            name: f.name,
            text: JSON.stringify(parsed).slice(0, MAX_DOC_LENGTH),
          });

        } else if (lower.endsWith(".json")) {
          const raw = await fileRes.text();
          docs.push({ name: f.name, text: raw.slice(0, MAX_DOC_LENGTH) });

        } else if (lower.endsWith(".rtf")) {
          const raw = await fileRes.text();
          const plain = raw
            .replace(/\\[a-z]+\d* ?/g, "")
            .replace(/[{}]/g, "")
            .replace(/\n+/g, "\n");
          docs.push({ name: f.name, text: plain.slice(0, MAX_DOC_LENGTH) });
        }
      } catch (e) {
        console.warn(`Failed to parse ${f.name}:`, e);
      }
    }

    // 4) Score docs
    const keywords = message
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);

    const scoredDocs = docs
      .map((doc) => ({
        ...doc,
        score: keywords.reduce(
          (acc, kw) =>
            acc + (doc.text.toLowerCase().includes(kw) ? 1 : 0),
          0
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const contextText = scoredDocs
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