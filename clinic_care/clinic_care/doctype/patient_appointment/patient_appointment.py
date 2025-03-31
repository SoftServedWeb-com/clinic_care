# Copyright (c) 2025, Soft Served Web and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
import frappe
import json
from frappe import _
from frappe.utils import getdate, get_time, format_date, format_time, flt
import datetime


class PatientAppointment(Document):
	pass

@frappe.whitelist()
def get_availability_data(practitioner, date, appointment=None):
    """
    Get availability data of 'practitioner' on 'date'
    :param date: Date to check in schedule
    :param practitioner: Name of the practitioner
    :param appointment: Current appointment object if editing
    :return: dict containing a list of available slots, list of appointments and time of appointments
    """
    date = getdate(date)
    weekday = date.strftime("%A") # Get the weekday ie: Monday,Tuesday ..

    practitioner_doc = frappe.get_doc("Healthcare Practitioner", practitioner)

    if not practitioner_doc.practitioner_schedule:
        frappe.throw(
            _("{0} does not have a Healthcare Practitioner Schedule. Add it in Healthcare Practitioner master").format(practitioner),
            title=_("Practitioner Schedule Not Found"),
        )

    slot_details = get_available_slots(practitioner_doc, date)

    if not slot_details:
        frappe.throw(
            _("Healthcare Practitioner not available on {0}").format(weekday), 
            title=_("Not Available")
        )

    # If appointment is being edited, convert string to dict
    if isinstance(appointment, str):
        appointment = json.loads(appointment)
        appointment = frappe.get_doc(appointment)

    return {"slot_details": slot_details}

def get_available_slots(practitioner_doc, date):
    available_slots = slot_details = []
    weekday = date.strftime("%A") # Get the weekday ie: Monday, Tuesday ...
    practitioner = practitioner_doc.name

    for schedule_entry in practitioner_doc.practitioner_schedule:
        if not schedule_entry.schedule:
            continue
            
        practitioner_schedule = frappe.get_doc("Practitioner Schedule", schedule_entry.schedule)

        if practitioner_schedule and not practitioner_schedule.disabled:
            available_slots = []
            for time_slot in practitioner_schedule.time_slots:
                if weekday == time_slot.day:
                    available_slots.append(time_slot)

            if available_slots:
                appointments = []
                
                # Fetch all appointments for this practitioner on this date
                filters = {
                    "practitioner": practitioner,
                    "appointment_date": date,
                    "status": ["not in", ["Cancelled"]],
                }

                appointments = frappe.get_all(
                    "Patient Appointment",
                    filters=filters,
                    fields=["name", "appointment_time", "duration", "status", "appointment_date"],
                )

                slot_details.append({
                    "slot_name": schedule_entry.schedule,
                    "avail_slot": available_slots,
                    "appointments": appointments,
                    "tele_conf": practitioner_schedule.allow_video_conferencing,
                })
    
    return slot_details

@frappe.whitelist()
def update_status(appointment_id, status):
    frappe.db.set_value("Patient Appointment", appointment_id, "status", status)
    if status == "Cancelled":
        cancel_appointment(appointment_id)
    
def cancel_appointment(appointment_id):
    appointment = frappe.get_doc("Patient Appointment", appointment_id)
    frappe.msgprint(_("Appointment Cancelled."))