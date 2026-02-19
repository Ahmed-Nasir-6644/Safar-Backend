from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI
import os
import json
from fastapi.middleware.cors import CORSMiddleware # 1. ADD THIS IMPORT
# start using: uvicorn ai_service:app --reload --port 8000
SYSTEM_PROMPT = """
You are a helpful customer service assistant for MetroMate, a public transportation route finding and management system. 

COMPANY INFORMATION:
- MetroMate is a comprehensive public transport solution that helps users find optimal routes using real-time GTFS data
- We provide route planning, schedule information, and navigation assistance for public transportation
- Our system uses advanced algorithms like Dijkstra's algorithm to find the best routes
- We support multiple transportation modes and provide real-time updates

FREQUENTLY ASKED QUESTIONS:
Q: What is MetroMate?
A: MetroMate is a public transportation route finder that helps you navigate your city's transit system efficiently. We provide real-time route planning, schedules, and navigation assistance.

# ... (Keep the rest of your prompt here, shortened for readability) ...

INSTRUCTIONS:
- Always be helpful, polite, and professional
- If you don't know something specific about MetroMate, acknowledge that and offer to connect the user with support
- Focus on transportation-related queries and MetroMate's features
- Provide clear, concise answers
- If asked about technical issues, guide users to appropriate support channels
- Keep responses conversational but informative
"""

SYSTEM_PROMPT_VOICE = """
You are a public transport journey summarization engine.

Your job is to extract high-level journey structure from structured or semi-structured transit data.

You must generate:

1. A single short spoken summary paragraph (maximum 90 words).
2. A structured JSON dictionary with extracted journey details.

-------------------------------------------------------
IMPORTANT RULES
-------------------------------------------------------

- DO NOT list all stops.
- DO NOT repeat intermediate station names.
- DO NOT exceed one paragraph.
- DO NOT explain reasoning.
- DO NOT invent or guess missing values.
- ALWAYS return valid JSON only.
- If required data is missing, return the fallback response exactly as shown.

-------------------------------------------------------
HOW TO IDENTIFY TRANSFERS
-------------------------------------------------------

A transfer occurs when:
- A new route begins after a previous one ends.

There may be ZERO, ONE, or MULTIPLE transfers.

You must dynamically extract all route segments in order.

Each segment must include:
- route_name
- stop_count

The transfer stop is the stop where one route ends and the next route begins.

-------------------------------------------------------
REQUIRED OUTPUT STRUCTURE
-------------------------------------------------------

{
  "summary": "One short paragraph summary here.",
  "details": {
    "total_duration": "",
    "total_stops": "",
    "total_transfers": "",
    "walking_distance_meters": "",
    "total_fare": "",
    "segments": [
      {
        "route_name": "",
        "stop_count": "",
        "boarding_stop": "",
        "alighting_stop": ""
      }
    ]
  }
}

-------------------------------------------------------
SUMMARY REQUIREMENTS
-------------------------------------------------------

The summary must include:
- Total journey time
- Each route in order
- Transfer locations (without listing all stops)
- Total fare

Keep it natural and concise.

-------------------------------------------------------
FALLBACK RESPONSE (IF DATA IS INCOMPLETE)
-------------------------------------------------------

{
  "summary": "Journey information is currently unavailable.",
  "details": null
}

Do not return anything outside JSON.

"""

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # This is your React app's exact URL
    allow_credentials=True,
    allow_methods=["*"], # Allows POST, GET, OPTIONS, etc.
    allow_headers=["*"], # Allows all headers like Content-Type
)
DEEPSEEK_API_KEY = "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" # Put your NEW key here
DEEPSEEK_BASE_URL = "https://openrouter.ai/api/v1"

# 1. Added a 60-second timeout directly to the client
client = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_BASE_URL,
    timeout=60.0 
)

class OCRRequest(BaseModel):
    ocr_result: str

@app.post("/message")
async def classify(request: OCRRequest):
    # 2. Try/Except block for error handling
    try:
        response = client.chat.completions.create(
            model="arcee-ai/trinity-large-preview:free",
            temperature=0,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"ocr_result": request.ocr_result},
                        ensure_ascii=False
                    )
                }
            ]
        )

        prediction = response.choices[0].message.content.strip()
        
        # 3. Success Response format
        return {
            "success": True, 
            "prediction": prediction, 
            "error": None
        }

    except Exception as e:
        # 4. Error Response format (catches timeouts, bad API keys, etc.)
        return {
            "success": False, 
            "prediction": None, 
            "error": str(e)
        }
    

@app.post("/dictate")
async def dictate(request: OCRRequest):
    # 2. Try/Except block for error handling
    try:
        response = client.chat.completions.create(
            model="arcee-ai/trinity-large-preview:free",
            temperature=0,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_VOICE},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"ocr_result": request.ocr_result},
                        ensure_ascii=False
                    )
                }
            ]
        )

        prediction = response.choices[0].message.content.strip()
        
        # 3. Success Response format
        return {
            "success": True, 
            "prediction": prediction, 
            "error": None
        }

    except Exception as e:
        # 4. Error Response format (catches timeouts, bad API keys, etc.)
        return {
            "success": False, 
            "prediction": None, 
            "error": str(e)
        }

# --- TESTING BLOCK ---
if __name__ == "__main__":
    import asyncio

    async def run_test():
        print("Sending request... (Timeout set to 60s)\n")
        
        # Simulating a dynamic request
        test_data = OCRRequest(ocr_result="""27 min
Total journey time
20 stops
1 transfer
Rs. 80

Board FR-3A at F-6/3

11 stops
•
12 min
F-6/3 Origin
Old Zoo Stop
Kohsar Road Stop
Parveen Shakir Road Stop
Faisal Masjid Stop
Naval Complex Stop
Bahria University Stop
Shaheen Chowk Stop
F-9 Park Ravi Gate Stop
F-8 Markaz Stop
F-8 Katchery Stop
PIMS Metro Station
Transfer
Transfer to Red Line at PIMS Metro Station

9 stops
•
11 min
PIMS Metro Station
Kachehry Metro Station
Ibn-e-Sina Metro Station
Chaman Metro Station
Kashmir Highway Metro Station
Faiz Ahmad Faiz Metro Station
Khayaban-e-Johar Metro Station
Potohar Metro Station
IJ Principal Metro Station
Faizabad Metro Station
""")

        result = await dictate(test_data)
        
        print("=== RESPONSE ===")
        print(json.dumps(result, indent=2))
        print("================")

    asyncio.run(run_test())