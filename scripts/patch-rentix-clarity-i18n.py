#!/usr/bin/env python3
"""Patch translations for Rentix clarity plan."""
import json
from pathlib import Path

TRANS = Path(__file__).resolve().parent.parent / "src" / "i18n" / "translations.json"

PATCH_HE = {
    "quote_modules_hint": "הזינו מספר קארטים — תראו אילו מודולים כלולים בחבילה. חיבור TranX/decoder כלול בהתקנה; ציוד פיזי — דרך partner.",
    "mod_hardware_vs_booking_title": "חומרה ותזמון — כלול ברישיון",
    "mod_hardware_vs_booking_body": "חיבור decoder (TranX 160) ו-transponder — חלק מההתקנה, כלול בכל החבילות. HAKAFAST Pro כולל kiosk הזמנות מקומי offline — ללא מערכת הזמנות חיצונית.",
    "busy_day_heat_1": "הוסיפו נהגים מהקבלה או מה-kiosk לתור",
    "mod_guide_reception_2_title": "Kiosk / הזמנות",
    "mod_guide_reception_2_body": "Pro+: הזמנות מ-/booking או לוח יום — נהגים נכנסים לתור אוטומטית.",
    "quote_booking_decision_title": "איך מנהלים הזמנות?",
    "quote_booking_decision_new": "מסלול חדש / בלי מערכת חיצונית → Pro כולל kiosk + לוח יום (offline, ללא cloud)",
    "quote_booking_decision_payment": "צריך גבייה באפליקציה → תוספת מודול תשלום + חשבון סליקה (Cardcom, Tranzila, Bit):",
    "quote_booking_decision_legacy": "מערכת הזמנות חיצונית קיימת? → פנה לתמיכה — חיבור טכני זמין לפי בקשה, לא חלק מהחבילה",
    "quote_hardware_highlight_title": "TranX / decoder — מה כלול?",
    "quote_hardware_highlight_body": "רוב המסלולים בישראל כבר עם MYLAPS TranX. HAKAFAST מתחבר ל-decoder הקיים — ללא רכישת timing נוסף.",
    "quote_hardware_included": "כלול בכל החבילות (תוכנה + התקנה)",
    "quote_addons_on_request": "תוספות נוספות (חיבור למערכות legacy) — זמינות לפי בקשה, לא מופיעות במחירון.",
}

PATCH_EN = {
    "quote_modules_hint": "Enter kart count to see included modules. TranX/decoder connection included with install; physical gear via partner.",
    "mod_hardware_vs_booking_title": "Hardware & timing — included in license",
    "mod_hardware_vs_booking_body": "TranX 160 decoder connection is included in all tiers. Pro includes offline booking kiosk — no external booking system required.",
    "busy_day_heat_1": "Add drivers from reception or booking kiosk to queue",
    "mod_guide_reception_2_title": "Kiosk / bookings",
    "mod_guide_reception_2_body": "Pro+: bookings from /booking or day planner flow into the queue automatically.",
    "quote_booking_decision_title": "How do you manage bookings?",
    "quote_booking_decision_new": "New track / no external system → Pro includes kiosk + day planner (offline)",
    "quote_booking_decision_payment": "Need in-app payment → payment module add-on + payment provider account:",
    "quote_booking_decision_legacy": "Existing external booking system? → Contact support — technical bridge available on request, not in standard packages",
    "quote_hardware_highlight_title": "TranX / decoder — what's included?",
    "quote_hardware_highlight_body": "Most tracks already have MYLAPS TranX. HAKAFAST connects to your existing decoder.",
    "quote_hardware_included": "Included in all tiers (software + setup)",
    "quote_addons_on_request": "Additional integrations (legacy systems) available on request — not shown in the price list.",
}

PATCH_AR = {
    "quote_modules_hint": "أدخل عدد الكarts لرؤية الوحدات المشمولة. اتصال TranX/decoder مشمول في التثبيت.",
    "mod_hardware_vs_booking_title": "الأجهزة والتوقيت — مشمول في الترخيص",
    "mod_hardware_vs_booking_body": "اتصال TranX 160 مشمول. Pro يشمل kiosk حجوزات offline.",
    "busy_day_heat_1": "أضف السائقين من الاستقبال أو kiosk",
    "quote_booking_decision_title": "كيف تدير الحجوزات؟",
    "quote_booking_decision_new": "مسار جديد → Pro يشمل kiosk + مخطط اليوم (offline)",
    "quote_booking_decision_payment": "تحتاج دفع في التطبيق → إضافة وحدة الدفع + حساب سелיקה:",
    "quote_booking_decision_legacy": "نظام حجوزات خارجي؟ → اتصل بالدعم — جسر تقني متاح عند الطلب",
    "quote_hardware_highlight_title": "TranX / decoder — ما المشمول؟",
    "quote_hardware_highlight_body": "معظم المسارات لديها TranX. HAKAFAST يتصل بال-decoder الموجود.",
    "quote_hardware_included": "مشمول في جميع الباقات",
    "quote_addons_on_request": "تكاملات إضافية متاحة عند الطلب.",
}


def main():
    data = json.loads(TRANS.read_text(encoding="utf-8"))
    data["he"].update(PATCH_HE)
    data["en"].update(PATCH_EN)
    data["ar"].update(PATCH_AR)
    TRANS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Patched", TRANS)


if __name__ == "__main__":
    main()
