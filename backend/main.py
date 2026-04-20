# ════════════════════════════════════════════════════════════════════
# APPEND THIS to the bottom of your backend/main.py
# Also add this import at the top of main.py (with the other imports):
#
#     from services.email_service import send_offer_letter_email
#
# ════════════════════════════════════════════════════════════════════

from services.email_service import send_offer_letter_email
from pydantic import BaseModel
from datetime import datetime


class OfferLetterPayload(BaseModel):
    candidate_id: str
    candidate_name: str
    candidate_email: str
    designation: str
    company_name: str
    letter_body: str


@app.post("/send-offer-letter/")
def send_offer_letter(payload: OfferLetterPayload):
    """
    Send an offer letter email to a candidate.
    Also logs the event on the candidate's record in MongoDB.
    """
    if not payload.candidate_email:
        raise HTTPException(status_code=400, detail="Candidate email is missing.")

    result = send_offer_letter_email(
        candidate_name=payload.candidate_name,
        candidate_email=payload.candidate_email,
        designation=payload.designation,
        company_name=payload.company_name,
        letter_body=payload.letter_body,
    )

    # Log the attempt on the candidate document regardless of outcome
    try:
        from services.mongo_service import candidates_collection
        candidates_collection.update_one(
            {"candidate_id": payload.candidate_id},
            {"$set": {
                "offer_letter": {
                    "sent_at": datetime.now(),
                    "sent_to": payload.candidate_email,
                    "designation": payload.designation,
                    "status": "sent" if result["success"] else "failed",
                    "message": result["message"],
                }
            }}
        )
    except Exception as log_err:
        # Don't let a DB log error break the response
        print(f"Could not log offer letter to DB: {log_err}")

    if not result["success"]:
        # Return a structured response so the frontend can show the message
        return result

    return result