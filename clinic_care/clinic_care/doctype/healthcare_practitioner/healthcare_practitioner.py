# Copyright (c) 2025, Soft Served Web and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class HealthcarePractitioner(Document):
	def validate(self):
		self.set_full_name()
		is_overlapping,message = self.check_practitioner_schedule_overlap()
		if is_overlapping:
			frappe.throw("Some schedules are overlapping")

	def set_full_name(self):
		"""
		Genereates a full name based on the first name, middle name, and last name of the patient.
		"""
		self.practitioner_name = " ".join(
			[name.strip() for name in [self.first_name, self.middle_name, self.last_name] if name]
		)
	def check_practitioner_schedule_overlap(self, new_schedule=None):
		"""
		Check for overlapping schedules for a practitioner.
		
		Args:
			practitioner_name: The name/ID of the Healthcare Practitioner
			new_schedule: Optional - if checking before adding a new schedule
			
		Returns:
			tuple: (has_overlap, message)
		"""
		
		
		# Get list of all schedules to check
		schedules_to_check = [s.schedule for s in self.practitioner_schedule]
		
		# Add new schedule if provided
		if new_schedule and new_schedule not in schedules_to_check:
			schedules_to_check.append(new_schedule)
		
		# Create a dictionary to store all time slots by day
		day_slots = {}
		schedule_details = {}
		
		# Get all time slots from all schedules
		for schedule_name in schedules_to_check:
			schedule_doc = frappe.get_doc('Practitioner Schedule', schedule_name)
			schedule_details[schedule_name] = schedule_doc.schedule_name
			
			for slot in schedule_doc.time_slots:
				day = slot.day
				
				if day not in day_slots:
					day_slots[day] = []
					
				day_slots[day].append({
					"schedule": schedule_name,
					"from_time": slot.from_time.total_seconds(),
					"to_time": slot.to_time.total_seconds(),
				})
		
		# Check for overlaps in each day
		overlaps = []
		
		for day, slots in day_slots.items():
			# Sort slots by start time
			sorted_slots = sorted(slots, key=lambda x: x["from_time"])
			
			# Check for overlaps
			for i in range(len(sorted_slots) - 1):
				for j in range(i + 1, len(sorted_slots)):
					slot1 = sorted_slots[i]
					slot2 = sorted_slots[j]
					
					# Check if slot1 and slot2 are from different schedules
					if slot1["schedule"] != slot2["schedule"]:
						# Check for overlap
						if slot1["to_time"] > slot2["from_time"] and slot1["from_time"] < slot2["to_time"]:
							# Format times for display
							slot1_from = self.format_seconds_to_time(slot1["from_time"])
							slot1_to = self.format_seconds_to_time(slot1["to_time"])
							slot2_from = self.format_seconds_to_time(slot2["from_time"])
							slot2_to = self.format_seconds_to_time(slot2["to_time"])
							
							overlaps.append({
								"day": day,
								"schedule1": schedule_details[slot1["schedule"]],
								"time1": f"{slot1_from} - {slot1_to}",
								"schedule2": schedule_details[slot2["schedule"]],
								"time2": f"{slot2_from} - {slot2_to}"
							})
		
		# Generate message
		if not overlaps:
			return False, "No schedule overlaps found."
		else:
			message = "Schedule overlaps detected:\n\n"
			for overlap in overlaps:
				message += f"**{overlap['day']}**:\n"
				message += f"- {overlap['schedule1']}: {overlap['time1']}\n"
				message += f"- {overlap['schedule2']}: {overlap['time2']}\n\n"
			
			return True, message

	def format_seconds_to_time(self,seconds):
		"""Convert seconds to HH:MM format"""
		hours = int(seconds // 3600)
		minutes = int((seconds % 3600) // 60)
		return f"{hours:02d}:{minutes:02d}"