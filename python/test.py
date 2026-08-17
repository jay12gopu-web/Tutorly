import os

from groq import Groq


groq_api_key = os.getenv("GROQ_API_KEY")
if not groq_api_key:
    raise RuntimeError("Set GROQ_API_KEY before running this script.")

client = Groq(api_key=groq_api_key)

user_input = input("Ask something: ")

chat_completion = client.chat.completions.create(
    messages=[
        {
            "role": "user",
            "content": user_input,
        }
    ],
    model="llama-3.3-70b-versatile",
)

print("\nAI:", chat_completion.choices[0].message.content)
