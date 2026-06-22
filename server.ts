import express from "express";
import path from "path";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

const upload = multer({
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB max file size
});

app.post("/api/extract", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No PDF file uploaded" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
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
                    "CRITICAL MELC CODE FORMATTING RULE: Construct the 'melcCode' column explicitly using this format: [SubjectPrefix][GradeLevelNumber]-[WeekNumber].\n" +
                    "1. SubjectPrefix map: English=EN, Mathematics=M, Araling Panlipunan=AP, Edukasyon sa Pagpapakatao=ESP, Filipino=FIL, MAPEH=MA, Science=S, TLE=TLE.\n" +
                    "2. GradeLevelNumber: Just the numerical grade (e.g. Grade 10 -> 10, Grade 2 -> 2).\n" +
                    "3. WeekNumber: Use the 'objectiveDayNumber' as the reference for the week, zero-padded to 2 digits (e.g. Day 1 -> 01, Day 10 -> 10).\n" +
                    "Examples: English for grade 10 for week 1 -> EN10-01, Mathematics for grade 2 for week 10 -> M2-10.\n" +
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
              subjectCode: { type: Type.STRING, description: "E.g., MATH, ENG" },
              subjectName: { type: Type.STRING, description: "E.g., Mathematics, English" },
              melcCode: { type: Type.STRING, description: "The specific curriculum code for the competency" },
              melcDescription: { type: Type.STRING, description: "The description of the competency or objective" },
              objectiveDayNumber: { type: Type.NUMBER, description: "The day number or duration assigned to this objective if present, otherwise 0" },
              objectiveText: { type: Type.STRING, description: "The specific text describing the objective" },
              objectiveSortOrder: { type: Type.NUMBER, description: "Sequential order of the objective to maintain sorting, e.g., 1, 2, 3" }
            },
            required: [
              "gradeLevelCode", "gradeLevelName", 
              "subjectCode", "subjectName", 
              "melcCode", "melcDescription", 
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
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
