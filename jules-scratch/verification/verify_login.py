import os
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.goto(f"file://{os.getcwd()}/index.html")
    page.screenshot(path="jules-scratch/verification/login.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
