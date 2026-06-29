import express from "express";
import path from "path";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const SUBJECT_CODE_MAP: Record<string, string> = {
  english: "ENG",
  filipino: "FIL",
  mathematics: "MATH",
  science: "SCI",
  "araling panlipunan": "AP",
  "edukasyon sa pagpapakatao": "ESP",
  mapeh: "MAPEH",
  tle: "TLE",
  epp: "EPP",
  language: "LANG",
  "reading and literacy": "RL",
  makabansa: "MA",
};

function normalizeSubjectKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getSubjectCode(subjectName: unknown, subjectCode: unknown) {
  const normalizedSubjectName = normalizeSubjectKey(subjectName);
  const normalizedSubjectCode = normalizeSubjectKey(subjectCode);

  return (
    SUBJECT_CODE_MAP[normalizedSubjectName] ??
    SUBJECT_CODE_MAP[normalizedSubjectCode] ??
    String(subjectCode ?? "").trim().toUpperCase()
  );
}

function getGradeLevelNumber(gradeLevelCode: unknown, gradeLevelName: unknown) {
  const codeMatch = String(gradeLevelCode ?? "").match(/\d+/);
  if (codeMatch) {
    return String(Number.parseInt(codeMatch[0], 10));
  }

  const nameMatch = String(gradeLevelName ?? "").match(/\d+/);
  if (nameMatch) {
    return String(Number.parseInt(nameMatch[0], 10));
  }

  if (/kindergarten/i.test(String(gradeLevelName ?? "")) || /^K$/i.test(String(gradeLevelCode ?? ""))) {
    return "K";
  }

  return String(gradeLevelCode ?? "").trim().toUpperCase();
}

function getTermNumber(termNumber: unknown) {
  const parsedTerm = Number(termNumber);
  return Number.isFinite(parsedTerm) ? String(Math.trunc(parsedTerm)) : "0";
}

function getWeekNumber(objectiveDayNumber: unknown) {
  const parsedWeek = Number(objectiveDayNumber);
  return Number.isFinite(parsedWeek) ? String(Math.trunc(parsedWeek)).padStart(2, "0") : "00";
}

function buildMelcCode(row: { subjectName?: unknown; subjectCode?: unknown; gradeLevelCode?: unknown; gradeLevelName?: unknown; termNumber?: unknown; objectiveDayNumber?: unknown; }) {
  const subjectPrefix = getSubjectCode(row.subjectName, row.subjectCode);
  const gradeLevelNumber = getGradeLevelNumber(row.gradeLevelCode, row.gradeLevelName);
  const termNumber = getTermNumber(row.termNumber);
  const weekNumber = getWeekNumber(row.objectiveDayNumber);

  return `${subjectPrefix}${gradeLevelNumber}-${termNumber}-${weekNumber}`;
}

const app = express();
const PORT = 3000;

const upload = multer({
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB max file size
});

app.all("/api/extract", (req, res, next) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Method Not Allowed: ${req.method}. Please ensure you are not being redirected.` });
  }
  next();
});

app.post("/api/extract", (req, res, next) => {
  upload.single("pdf")(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(500).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No PDF file uploaded" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: "GEMINI_API_KEY is not configured on the server. Create a .env.local or .env file in the project root with GEMINI_API_KEY set, then restart npm run dev.",
      });
      return;
    }

    const ai = new GoogleGenAI({ 
      apiKey, 
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' }
      } 
    });

    const modelParams = {
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: req.file.buffer.toString("base64"),
                mimeType: req.file.mimetype || "application/pdf"
              }
            },
            {
              text: "Extract all curriculum objectives and competencies from this PDF into a structured format. " +
                    "Return an array of JSON objects matching the schema exactly. If a specific objective parameter " +
                    "is missing, infer it from the context if obvious, or use empty strings/0.\n" +
                  "CRITICAL SUBJECT CODE RULE: Use these subject codes exactly: English=ENG, Filipino=FIL, Mathematics=MATH, Science=SCI, Araling Panlipunan=AP, Edukasyon sa Pagpapakatao=ESP, MAPEH=MAPEH, TLE=TLE, EPP=EPP, Language=LANG, Reading and Literacy=RL, Makabansa=MA.\n" +
                  "CRITICAL MELC CODE FORMATTING RULE: Construct the 'melcCode' column explicitly using this format: [SubjectPrefix][GradeLevelNumber]-[TermNumber]-[WeekNumber].\n" +
                  "1. SubjectPrefix: Use the subject code mapping above.\n" +
                  "2. GradeLevelNumber: Just the numerical grade (e.g. Grade 10 -> 10, Grade 2 -> 2).\n" +
                  "3. TermNumber: Use the term number from the document (e.g. 2nd term -> 2).\n" +
                  "4. WeekNumber: Use the 'objectiveDayNumber' as the reference for the week, zero-padded to 2 digits (e.g. Day 1 -> 01, Day 10 -> 10).\n" +
                  "Example: English grade 1 for 2nd term in week 6 -> EN1-2-06.\n" +
                    "Make sure to extract all rows in the document sequentially."
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              gradeLevelCode: { type: Type.STRING, description: "E.g., G1, G2, K" },
              gradeLevelName: { type: Type.STRING, description: "E.g., Grade 1, Kindergarten" },
              subjectCode: { type: Type.STRING, description: "E.g., ENG, FIL, MATH, SCI" },
              subjectName: { type: Type.STRING, description: "E.g., Mathematics, English" },
              termNumber: { type: Type.NUMBER, description: "The term number extracted from the document, e.g. 1, 2, or 3" },
              melcCode: { type: Type.STRING, description: "The specific curriculum code for the competency" },
              melcDescription: { type: Type.STRING, description: "The description of the competency or objective" },
              objectiveDayNumber: { type: Type.NUMBER, description: "The day number or duration assigned to this objective if present, otherwise 0" },
              objectiveText: { type: Type.STRING, description: "The specific text describing the objective" },
              objectiveSortOrder: { type: Type.NUMBER, description: "Sequential order of the objective to maintain sorting, e.g., 1, 2, 3" }
            },
            required: [
              "gradeLevelCode", "gradeLevelName", 
              "subjectCode", "subjectName", 
              "termNumber", "melcCode", "melcDescription", 
              "objectiveDayNumber", "objectiveText", "objectiveSortOrder"
            ]
          }
        }
      }
    };

    const response = await ai.models.generateContent(modelParams);
    
    if (!response.text) {
      res.status(500).json({ error: "Failed to generate structured data." });
      return;
    }

    try {
      let data = JSON.parse(response.text);
      if (Array.isArray(data)) {
        const melcMap = new Map();
        
        data.forEach((row, index) => {
          row.subjectCode = getSubjectCode(row.subjectName, row.subjectCode);
          row.melcCode = buildMelcCode(row);
          row.severity = "Normal";
          if (row.melcCode) {
            if (melcMap.has(row.melcCode)) {
              // Conflicting Melc Duplicate check
              const firstRow = melcMap.get(row.melcCode);
              
              if (
                row.gradeLevelName !== firstRow.gradeLevelName ||
                row.subjectName !== firstRow.subjectName ||
                row.melcDescription !== firstRow.melcDescription
              ) {
                // If there's a conflict, force the duplicate to use the same values as the first occurrence
                row.gradeLevelName = firstRow.gradeLevelName;
                row.subjectName = firstRow.subjectName;
                row.melcDescription = firstRow.melcDescription;
                
                row.severity = "Conflict Resolved";
                firstRow.severity = "Conflict Resolved";
              }
            } else {
              melcMap.set(row.melcCode, row);
            }
          }
        });
      }
      res.json({ data });
    } catch (parseError) {
      console.error("JSON Error:", parseError, response.text);
      res.status(500).json({ error: "Failed to parse structured data returned by the model." });
    }

  } catch (err: any) {
    console.error("API Error:", err);
    res.status(500).json({ error: err.message || "An error occurred during extraction" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // We expect the build to output to dist/
    // Since server runs from dist/server.cjs, dist path can be mapped
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
