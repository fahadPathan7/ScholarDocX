import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

async def main():
    polar_token = os.environ.get("POLAR_ACCESS_TOKEN")
    polar_api_url = "https://sandbox-api.polar.sh/v1"
    
    async with httpx.AsyncClient() as client:
        req_body = {
            "product_id": "2f6b73c7-a6c5-499f-a00d-4f522e2a4c81",
            "success_url": "http://localhost:5173"
        }
        print(f"Sending: {req_body}")
        response = await client.post(
            f"{polar_api_url}/checkouts/",
            json=req_body,
            headers={
                "Authorization": f"Bearer {polar_token}",
                "Content-Type": "application/json"
            }
        )
        print(response.status_code)
        print(response.text)

asyncio.run(main())
