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

# # --- TESTING BLOCK ---
# if __name__ == "__main__":
#     import asyncio

#     async def run_test():
#         print("Sending request... (Timeout set to 60s)\n")
        
#         # Simulating a dynamic request
#         test_data = OCRRequest(ocr_result="""
# Route: 16 stops, 11.74km, 28min, 200 PKR, 4 transfers, buses: FR_9, FR_14, FR_8C, FR_8A, bus sequence: FR_9 → FR_14 → FR_8C → FR_14 → FR_8A
#     Transfer Details: {
#   "transferCount": 4,
#   "busesUsed": [
#     "FR_9",
#     "FR_14",
#     "FR_8C",
#     "FR_8A"
#   ],
#   "busSequence": [
#     "FR_9",
#     "FR_14",
#     "FR_8C",
#     "FR_14",
#     "FR_8A"
#   ],
#   "routeSegments": [
#     {
#       "routeName": "FR_9",
#       "routeId": "fr_9",
#       "stops": [
#         {
#           "stop_id": "pindora_chungi_down",
#           "stop_name": "Pindora Chungi",
#           "stop_lat": 33.65193979,
#           "stop_lon": 73.06369298
#         },
#         {
#           "stop_id": "ijp_station_fr_down",
#           "stop_name": "IJP Metro Station",
#           "stop_lat": 33.65557403,
#           "stop_lon": 73.06965844
#         },
#         {
#           "stop_id": "faizabad_station_down",
#           "stop_name": "Faizabad Metro Station",
#           "stop_lat": 33.66188134,
#           "stop_lon": 73.08220051
#         }
#       ],
#       "stopCount": 3,
#       "distance": 2.04,
#       "boardingStop": "Pindora Chungi",
#       "alightingStop": "Faizabad Metro Station"
#     },
#     {
#       "routeName": "FR_14",
#       "routeId": "fr_14",
#       "stops": [
#         {
#           "stop_id": "faizabad_station_down",
#           "stop_name": "Faizabad Metro Station",
#           "stop_lat": 33.66188134,
#           "stop_lon": 73.08220051
#         },
#         {
#           "stop_id": "itp_up",
#           "stop_name": "ITP Centre",
#           "stop_lat": 33.67178766,
#           "stop_lon": 73.09291283
#         }
#       ],
#       "stopCount": 2,
#       "distance": 1.48,
#       "boardingStop": "Faizabad Metro Station",
#       "alightingStop": "ITP Centre"
#     },
#     {
#       "routeName": "FR_8C",
#       "routeId": "fr_8c",
#       "stops": [
#         {
#           "stop_id": "itp_up",
#           "stop_name": "ITP Centre",
#           "stop_lat": 33.67178766,
#           "stop_lon": 73.09291283
#         },
#         {
#           "stop_id": "margalla_town_up",
#           "stop_name": "Margalla Town",
#           "stop_lat": 33.68145652,
#           "stop_lon": 73.10160518
#         },
#         {
#           "stop_id": "garden_avenue_up",
#           "stop_name": "Garden Avenue",
#           "stop_lat": 33.68530141,
#           "stop_lon": 73.1065224
#         }
#       ],
#       "stopCount": 3,
#       "distance": 1.97,
#       "boardingStop": "ITP Centre",
#       "alightingStop": "Garden Avenue"
#     },
#     {
#       "routeName": "FR_14",
#       "routeId": "fr_14",
#       "stops": [
#         {
#           "stop_id": "garden_avenue_up",
#           "stop_name": "Garden Avenue",
#           "stop_lat": 33.68530141,
#           "stop_lon": 73.1065224
#         },
#         {
#           "stop_id": "rawal_chowk_down",
#           "stop_name": "Rawal Chowk",
#           "stop_lat": 33.69205444,
#           "stop_lon": 73.11004651
#         }
#       ],
#       "stopCount": 2,
#       "distance": 0.82,
#       "boardingStop": "Garden Avenue",
#       "alightingStop": "Rawal Chowk"
#     },
#     {
#       "routeName": "FR_8A",
#       "routeId": "fr_8a",
#       "stops": [
#         {
#           "stop_id": "rawal_town_up",
#           "stop_name": "Rawal Town",
#           "stop_lat": 33.68926848,
#           "stop_lon": 73.11281756
#         },
#         {
#           "stop_id": "school_board_up",
#           "stop_name": "School Board Stop",
#           "stop_lat": 33.68900199,
#           "stop_lon": 73.11626498
#         },
#         {
#           "stop_id": "rawal_dam_colony_up",
#           "stop_name": "Rawal Dam Colony",
#           "stop_lat": 33.68818115,
#           "stop_lon": 73.12138032
#         },
#         {
#           "stop_id": "narc_colony_up",
#           "stop_name": "NARC Colony",
#           "stop_lat": 33.68752881,
#           "stop_lon": 73.1309279
#         },
#         {
#           "stop_id": "nih_allergy_up",
#           "stop_name": "NIH Allergy Center",
#           "stop_lat": 33.68511973,
#           "stop_lon": 73.13510897
#         },
#         {
#           "stop_id": "shehzad_town_up",
#           "stop_name": "Shahzad Town",
#           "stop_lat": 33.67656387,
#           "stop_lon": 73.1423405
#         },
#         {
#           "stop_id": "park_view_city_up",
#           "stop_name": "Park View City",
#           "stop_lat": 33.67413884,
#           "stop_lon": 73.14436779
#         },
#         {
#           "stop_id": "green_avenue_up",
#           "stop_name": "Green Avenue",
#           "stop_lat": 33.66730581,
#           "stop_lon": 73.15014159
#         },
#         {
#           "stop_id": "chatta_bakhtawar_up",
#           "stop_name": "Chatta Bakhtawar",
#           "stop_lat": 33.6642002,
#           "stop_lon": 73.1527488
#         }
#       ],
#       "stopCount": 9,
#       "distance": 5.43,
#       "boardingStop": "Rawal Town",
#       "alightingStop": "Chatta Bakhtawar"
#     }
#   ],
#   "tripLegs": [
#     {
#       "bus": "FR_9",
#       "edgeRange": "0-1"
#     },
#     {
#       "bus": "FR_14",
#       "edgeRange": "2-2"
#     },
#     {
#       "bus": "FR_8C",
#       "edgeRange": "3-4"
#     },
#     {
#       "bus": "FR_14",
#       "edgeRange": "5-5"
#     },
#     {
#       "bus": "FR_8A",
#       "edgeRange": "7-15"
#     }
#   ]
# }
# """)

#         result = await dictate(test_data)
        
#         print("=== RESPONSE ===")
#         print(json.dumps(result, indent=2))
#         print("================")

#     asyncio.run(run_test())