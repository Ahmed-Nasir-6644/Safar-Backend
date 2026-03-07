import asyncio
import tempfile
from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from openai import OpenAI
import os
import json
from fastapi.middleware.cors import CORSMiddleware # 1. ADD THIS IMPORT
from faster_whisper import WhisperModel
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


SYSTEM_PROMPT_NLP = """

Your task:
Extract the user's intended SOURCE stop and DESTINATION stop
from a spoken natural language sentence.

STRICT RULES:
1. Output MUST be valid JSON.
2. Do NOT add explanations.

Output format:
{
  "source": "<stop name>",
  "destination": "<stop name>"
}

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
# Multiple API keys with fallback mechanism
API_KEYS = [
    os.getenv("DEEPSEEK_API_KEY"),
    os.getenv("DEEPSEEK_API_KEY_2"), 
    os.getenv("DEEPSEEK_API_KEY_3"),
]
# Filter out None values (for keys not set in .env)
API_KEYS = [key for key in API_KEYS if key]

if not API_KEYS:
    raise ValueError("No API keys found in environment variables!")

DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://openrouter.ai/api/v1")
current_api_key_index = 0

def get_openai_client():
    """Get OpenAI client with current API key"""
    return OpenAI(
        api_key=API_KEYS[current_api_key_index],
        base_url=DEEPSEEK_BASE_URL,
        timeout=60.0
    )

def rotate_api_key():
    """Switch to next API key in the list"""
    global current_api_key_index
    current_api_key_index = (current_api_key_index + 1) % len(API_KEYS)
    print(f"Switched to API key #{current_api_key_index + 1}")

async def make_llm_request(messages, model="arcee-ai/trinity-large-preview:free", temperature=0, max_retries=None):
    """
    Make LLM request with automatic API key fallback
    Tries all API keys before giving up
    """
    if max_retries is None:
        max_retries = len(API_KEYS)
    
    last_error = None
    
    for attempt in range(max_retries):
        try:
            client = get_openai_client()
            response = client.chat.completions.create(
                model=model,
                temperature=temperature,
                messages=messages
            )
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            last_error = e
            error_str = str(e).lower()
            
            # Check if it's an API key related error (401, 403, 429, or rate limit)
            if any(code in error_str for code in ['401', '403', '429', 'unauthorized', 'forbidden', 'rate limit', 'quota']):
                print(f"API key error (attempt {attempt + 1}/{max_retries}): {e}")
                rotate_api_key()
                continue
            else:
                # Non-API-key error, don't retry
                print(f"Non-API-key error: {e}")
                break
    
    # All retries exhausted
    raise last_error

class OCRRequest(BaseModel):
    ocr_result: str

@app.post("/message")
async def classify(request: OCRRequest):
    try:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {"ocr_result": request.ocr_result},
                    ensure_ascii=False
                )
            }
        ]
        
        prediction = await make_llm_request(messages)
        
        return {
            "success": True, 
            "prediction": prediction, 
            "error": None
        }

    except Exception as e:
        return {
            "success": False, 
            "prediction": None, 
            "error": str(e)
        }
    

@app.post("/dictate")
async def dictate(request: OCRRequest):
    try:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT_VOICE},
            {
                "role": "user",
                "content": json.dumps(
                    {"ocr_result": request.ocr_result},
                    ensure_ascii=False
                )
            }
        ]
        
        prediction = await make_llm_request(messages)
        
        return {
            "success": True, 
            "prediction": prediction, 
            "error": None
        }

    except Exception as e:
        return {
            "success": False, 
            "prediction": None, 
            "error": str(e)
        }
    

class VoiceSearchRequest(BaseModel):
    transcript: str
# Load stops once at startup
with open("unique_stop_names.txt", "r", encoding="utf-8") as f:
    stops = [line.strip() for line in f if line.strip()]
from fuzzywuzzy import fuzz,process

@app.post("/voice-search")
async def voice_search(request: VoiceSearchRequest):
    try:
        # 1️⃣ Call LLM to extract source/destination using fallback mechanism
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT_NLP},
            {"role": "user", "content": request.transcript}
        ]
        
        prediction = await make_llm_request(messages)

        # 2️⃣ Parse prediction JSON
        import json
        data = json.loads(prediction)

        # 3️⃣ Validate extracted stops before fuzzy matching
        source_input = data.get("source") or ""
        destination_input = data.get("destination") or ""

        if not source_input.strip() or not destination_input.strip():
            return {
                "success": False,
                "prediction": None,
                "error": "Unclear input, please speak again."
            }

        best_source, source_score = process.extractOne(source_input, stops)
        best_destination, dest_score = process.extractOne(destination_input, stops)

        # 4️⃣ Return results
        return {
            "success": True,
            "prediction": {
                    "source": best_source,
                    "destination": best_destination
            },
            "error": None
        }

    except Exception as e:
        return {
            "success": False,
            "prediction": None,
            "error": str(e)
        }




import sounddevice as sd
from scipy.io.wavfile import write
# Load stops
with open("unique_stop_names.txt", "r", encoding="utf-8") as f:
    stops = [line.strip() for line in f if line.strip()]

SYSTEM_PROMPT_NLP = """
The user will speak a natural language sentence expressing their desire to travel from one location to another using public transportation. The sentence may be informal, ungrammatical, or raw.

Your task is to extract:
- source location phrase
- destination location phrase


Rules:

1. Extract any raw source and destination phrases as spoken, even if misspelled, raw or ungrammatical.
2. Do NOT correct spelling.
3. Do NOT normalize names.
4. Do NOT invent new location names.
5. If text is unclear, extract the closest location phrase as spoken.
6. If only one location is mentioned:
   - If sentence implies movement toward it (e.g., "to X"), set destination only.
   - If sentence implies movement from it (e.g., "from X"), set source only.
7. Return strictly valid JSON.
8. No explanations. No extra text.
Output format:

{
  "source": string | null,
  "destination": string | null
}
"""

# --- 1️⃣ Record live audio ---
def record_audio(filename="live_input.wav", duration=5, fs=16000):
    print(f"Recording for {duration} seconds... Speak now!")
    audio_data = sd.rec(int(duration * fs), samplerate=fs, channels=1)
    sd.wait()
    write(filename, fs, audio_data)
    print(f"Recording saved to {filename}")
    return filename

# --- 2️⃣ Speech-to-text (using faster-whisper locally) ---
_whisper_model = WhisperModel("base", device="cpu", compute_type="int8")

async def speech_to_text(audio_path: str):
    segments, info = _whisper_model.transcribe(audio_path, beam_size=5)
    transcript = " ".join(segment.text.strip() for segment in segments)
    print("Transcript:", transcript)
    return transcript

# --- 3️⃣ Extract stops ---
async def extract_stops_from_transcript(transcript: str):
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT_NLP},
        {"role": "user", "content": transcript}
    ]

    prediction = await make_llm_request(messages)
    data = json.loads(prediction)
    print("LLM Extracted Data:", data)
    source_input = data.get("source", "")
    destination_input = data.get("destination", "")
    # source_input = "Fessal Mosque"
    # destination_input = "Apara"

    best_source, _ = process.extractOne(source_input, stops, scorer=fuzz.token_sort_ratio)
    best_destination, _ = process.extractOne(destination_input, stops, scorer=fuzz.token_sort_ratio)

    return best_source, best_destination


@app.post("/voice-route")
async def voice_route(audio: UploadFile = File(...)):
    """
    Full pipeline endpoint:
    1. Accept audio file from frontend
    2. Transcribe using Faster-Whisper (STT)
    3. Extract raw source & destination via LLM
    4. Fuzzy-match against stop list
    5. Return structured JSON result
    """
    try:
        # 1️⃣ Save uploaded audio to a temp file
        suffix = os.path.splitext(audio.filename)[-1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await audio.read())
            tmp_path = tmp.name

        # 2️⃣ Transcribe with Faster-Whisper
        segments, _ = _whisper_model.transcribe(tmp_path, beam_size=5)
        transcript = " ".join(seg.text.strip() for seg in segments).strip()
        os.unlink(tmp_path)  # clean up temp file

        if not transcript:
            return {
                "success": False,
                "transcript": None,
                "prediction": None,
                "error": "Could not transcribe audio. Please speak clearly and try again."
            }

        # 3️⃣ Extract source & destination via LLM using fallback mechanism
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT_NLP},
            {"role": "user", "content": transcript}
        ]
        
        llm_raw = await make_llm_request(messages)
        data = json.loads(llm_raw)

        source_input = data.get("source") or ""
        destination_input = data.get("destination") or ""

        # 4️⃣ Validate — don't fuzzy-match if LLM returned null/empty
        if not source_input.strip() or not destination_input.strip():
            return {
                "success": False,
                "transcript": transcript,
                "prediction": None,
                "error": "Unclear input, please speak again."
            }

        # 5️⃣ Fuzzy match against stop list
        best_source, source_score = process.extractOne(
            source_input, stops, scorer=fuzz.token_sort_ratio
        )
        best_destination, dest_score = process.extractOne(
            destination_input, stops, scorer=fuzz.token_sort_ratio
        )

        # 6️⃣ Return structured result
        return {
            "success": True,
            "transcript": transcript,
            "prediction": {
                "source": best_source,
                "source_score": source_score,
                "destination": best_destination,
                "destination_score": dest_score
            },
            "error": None
        }

    except Exception as e:
        return {
            "success": False,
            "transcript": None,
            "prediction": None,
            "error": str(e)
        }
# async def main():
#     # Step 1: Record live speech
#     audio_file = record_audio(duration=7)  # record for 7 seconds

#     # Step 2: Convert speech to text
#     transcript = await speech_to_text('live_input.wav')  # Use the recorded file

#     # Step 3: Extract source/destination
#     source, destination = await extract_stops_from_transcript(transcript)
#     print("Best-matched source:", source)
#     print("Best-matched destination:", destination)

# if __name__ == "__main__":
#     asyncio.run(main())

# import requests

# url = "http://127.0.0.1:8000/voice-search"

# payload = {
#     "transcript": "I want to go from G6 to Metro station"
# }

# response = requests.post(url, json=payload)

# print("Status Code:", response.status_code)
# print("Response JSON:")
# print(response.json())
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