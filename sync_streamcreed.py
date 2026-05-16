import sys
import argparse
import re
import requests
import json
import time
from playwright.sync_api import sync_playwright
from datetime import datetime

# --- CONFIGURATION ---
PANEL_URL = "https://cms.streamcreed.com/d33e53c4d1dc/index.php?action=login"
MNG_LINES_URL = "https://cms.streamcreed.com/d33e53c4d1dc/userpanel/mnglines.php"

# Supabase Config
SB_URL = "https://bindidnosaflauksvfvb.supabase.co"
SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpbmRpZG5vc2FmbGF1a3N2ZnZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjEwNTIsImV4cCI6MjA5NDQzNzA1Mn0.IO9hK7_rTdRUiAVp7jk1lWDziZBZYHYXw3CRzCd7mK8"
SB_TABLE = "egy_customers"

def normalize_date(date_str):
    try:
        date_str = date_str.strip()
        if not date_str or date_str == '---': return None
        if '/' in date_str:
            d, m, y = date_str.split('/')
            return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
        return date_str
    except:
        return None

def push_to_supabase(customers):
    print(f"Pushing {len(customers)} records to Supabase...")
    headers = {
        "apikey": SB_KEY,
        "Authorization": f"Bearer {SB_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    
    batch_size = 50
    for i in range(0, len(customers), batch_size):
        batch = customers[i:i+batch_size]
        response = requests.post(f"{SB_URL}/rest/v1/{SB_TABLE}?on_conflict=username", headers=headers, json=batch)
        if response.status_code in [200, 201]:
            print(f"Batch {i//batch_size + 1} synced successfully.")
        else:
            print(f"Error in batch {i//batch_size + 1}: {response.text}")

def sync(user, password, key):
    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        print(f"Logging into StreamCreed as {user}...")
        page.goto(PANEL_URL)
        
        # Clear and Fill
        page.click('input#username')
        page.keyboard.press('Control+A')
        page.keyboard.press('Backspace')
        page.fill('input#username', user)
        
        page.click('input#password')
        page.keyboard.press('Control+A')
        page.keyboard.press('Backspace')
        page.fill('input#password', password)
        
        page.click('input#decryption_key')
        page.keyboard.press('Control+A')
        page.keyboard.press('Backspace')
        page.fill('input#decryption_key', key)
        
        page.click('button.btn-danger')
        
        page.wait_for_load_state("networkidle")
        
        if "action=login" in page.url:
            print("Login failed! Please check your credentials.")
            browser.close()
            return

        print("Navigating to Manage Lines...")
        page.goto(MNG_LINES_URL)
        page.wait_for_selector("table")

        all_scraped_data = []
        while True:
            print(f"Scraping current page...")
            page.wait_for_selector("table tbody tr")
            rows = page.query_selector_all("table tbody tr")
            
            for row in rows:
                cols = row.query_selector_all("td")
                if len(cols) < 8: continue
                
                username = cols[5].inner_text().strip()
                password_val = cols[6].inner_text().strip()
                expire_raw = cols[7].inner_text().strip()
                status_raw = cols[1].inner_text().strip()
                
                if username and username != "---" and len(username) > 1:
                    all_scraped_data.append({
                        "username": username,
                        "password": password_val,
                        "expire_date": normalize_date(expire_raw),
                        "status": "Enabled" if "Enabled" in status_raw else "Disabled"
                    })

            next_btn = page.query_selector("li.next:not(.disabled) a")
            if next_btn:
                next_btn.click()
                page.wait_for_load_state("networkidle")
                time.sleep(2)
            else:
                break

        print(f"Found {len(all_scraped_data)} raw records.")
        unique_data = {item['username']: item for item in all_scraped_data}
        final_data = list(unique_data.values())
        print(f"Final unique subscribers: {len(final_data)}")

        if final_data:
            push_to_supabase(final_data)
        
        browser.close()
        print("Sync Complete!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--key", required=True)
    args = parser.parse_args()
    
    sync(args.user, args.password, args.key)
