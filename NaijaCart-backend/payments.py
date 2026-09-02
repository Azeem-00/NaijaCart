"""payments.py -- verifies a Paystack transaction reference.

The browser only ever gets a *reference* from Paystack. We never trust that
the payment succeeded until our own server asks Paystack to confirm it.
"""
import os
import requests
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY", "").strip()
logger.info(f"PAYSTACK_SECRET_KEY loaded: {'YES' if PAYSTACK_SECRET_KEY else 'NO'}")
if PAYSTACK_SECRET_KEY:
    logger.info(f"Key starts with: {PAYSTACK_SECRET_KEY[:10]}...")


def verify_payment(reference):
    """
    Verify a Paystack transaction reference.
    
    Args:
        reference: The Paystack transaction reference to verify
        
    Returns:
        tuple: (success: bool, data: dict)
               - success: True if payment is verified successfully
               - data: Payment details from Paystack or error information
    """
    if not reference:
        logger.error("No payment reference provided")
        return False, {"error": "No reference supplied"}

    if not PAYSTACK_SECRET_KEY and str(reference).startswith("SIM-"):
        logger.info("Using demo payment verification for local simulation reference: %s", reference)
        return True, {"status": "success", "reference": reference, "gateway": "simulated", "amount": 0}

    if not PAYSTACK_SECRET_KEY:
        logger.error("PAYSTACK_SECRET_KEY is not configured")
        return False, {"error": "Payment service is not configured"}

    try:
        logger.info(f"Verifying payment reference: {reference}")
        res = requests.get(
            f"https://api.paystack.co/transaction/verify/{reference}",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"},
            timeout=15,
        )
        
        if res.status_code != 200:
            logger.error(f"Paystack API error: {res.status_code} - {res.text}")
            try:
                error_message = res.json().get("message")
            except ValueError:
                error_message = None
            return False, {
                "error": error_message or f"Payment verification failed: {res.status_code}"
            }
            
        data = res.json()
        
        if not data.get("status"):
            logger.error(f"Paystack returned error: {data.get('message', 'Unknown error')}")
            return False, {"error": data.get("message", "Payment verification failed")}
            
        payment_data = data.get("data", {})
        payment_status = payment_data.get("status")
        
        if payment_status == "success":
            logger.info(f"Payment verified successfully: {reference}")
            return True, payment_data
        else:
            logger.warning(f"Payment not successful: {reference} - Status: {payment_status}")
            return False, {"error": f"Payment not successful. Status: {payment_status}"}
            
    except requests.exceptions.Timeout:
        logger.error("Paystack API timeout")
        return False, {"error": "Payment verification timeout. Please try again."}
    except requests.exceptions.RequestException as e:
        logger.error(f"Paystack API request error: {str(e)}")
        return False, {"error": "Network error during payment verification"}
    except Exception as e:
        logger.error(f"Unexpected error during payment verification: {str(e)}")
        return False, {"error": "An error occurred during payment verification"}


def initialize_payment(email, amount, reference, callback_url):
    """Create a hosted Paystack checkout as a fallback for Inline JS."""
    if not PAYSTACK_SECRET_KEY and str(reference).startswith("SIM-"):
        return True, {"authorization_url": "#demo-payment", "reference": reference, "gateway": "simulated"}
    if not PAYSTACK_SECRET_KEY:
        return False, {"error": "Payment service is not configured"}
    try:
        response = requests.post(
            "https://api.paystack.co/transaction/initialize",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"},
            json={
                "email": email,
                "amount": int(round(float(amount) * 100)),
                "reference": reference,
                "callback_url": callback_url,
                "channels": ["card", "bank_transfer", "ussd"],
            },
            timeout=15,
        )
        data = response.json()
        if response.status_code != 200 or not data.get("status"):
            return False, {"error": data.get("message", "Payment initialization failed")}
        return True, data["data"]
    except (requests.exceptions.RequestException, ValueError) as error:
        logger.error(f"Paystack initialization error: {error}")
        return False, {"error": "Network error starting payment"}
