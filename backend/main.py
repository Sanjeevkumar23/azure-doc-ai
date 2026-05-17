from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "Azure Documentation AI Backend is running"
    }


@app.post("/analyze")
async def analyze_azure_file(file: UploadFile = File(...)):
    content = await file.read()
    data = json.loads(content)

    resources = data.get("resources", [])

    result = []
    resource_types = set()
    locations = set()

    for resource in resources:
        resource_info = {
            "name": resource.get("name"),
            "type": resource.get("type"),
            "location": resource.get("location"),
            "resourceGroup": resource.get("resourceGroup")
        }

        result.append(resource_info)

        if resource.get("type"):
            resource_types.add(resource.get("type"))

        if resource.get("location"):
            locations.add(resource.get("location"))

    summary = (
        f"This Azure environment contains {len(result)} resources "
        f"across {len(locations)} location(s). "
        f"Main services include: {', '.join(resource_types)}."
    )

    return {
        "summary": summary,
        "totalResources": len(result),
        "resources": result
    }