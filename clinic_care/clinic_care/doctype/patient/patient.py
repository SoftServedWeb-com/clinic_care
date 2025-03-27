# Copyright (c) 2025, Soft Served Web and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
import frappe
import dateutil
from frappe.model.naming import set_name_by_naming_series
from frappe.utils import cint, cstr, getdate
from frappe import _

class Patient(Document):
	def validate(self):
		self.set_full_name()

	def autoname(self):
		"""
		Genereates a unique patient name based on the naming series defined in the Clinic Care Settings.
		"""
		patient_name_by = frappe.db.get_single_value("Clinic Care Settings", "patient_name_by")
		if patient_name_by == "Patient Name":
			self.name = self.get_patient_name()
		else:
			set_name_by_naming_series(self)

	def get_patient_name(self):
		"""
			Generates a unique patient name.

			If a patient with the current name already exists, it appends a number to the name to make it unique.

			Returns:
				str: A unique patient name.
			"""
		self.set_full_name()
		name = self.patient_name
		if frappe.db.get_value("Patient", name):
			count = frappe.db.sql(
				"""select ifnull(MAX(CAST(SUBSTRING_INDEX(name, ' ', -1) AS UNSIGNED)), 0) from tabPatient
				 where name like %s""",
				"%{0} - %".format(name),
				as_list=1,
			)[0][0]
			count = cint(count) + 1
			return "{0} - {1}".format(name, cstr(count))

		return name
	
	def set_full_name(self):
		"""
		Genereates a full name based on the first name, middle name, and last name of the patient.
		"""
		self.patient_name = " ".join(
			[name.strip() for name in [self.first_name, self.middle_name, self.last_name] if name]
		)

	# def on_update(self):
	# 	if frappe.db.get_single_value("Healthcare Settings", "link_customer_to_patient"):
	# 		if self.customer:
	# 			if self.flags.existing_customer or frappe.db.exists(
	# 				{"doctype": "Patient", "name": ["!=", self.name], "customer": self.customer}
	# 			):
	# 				self.update_patient_based_on_existing_customer()
	# 			else:
	# 				self.update_linked_customer()

	# 		else:
	# 			create_customer(self)

	# 	self.set_contact()  # add or update contact

	# 	if self.flags.is_new_doc and self.get("address_line1"):
	# 		make_address(self)

	# 	if not self.user_id and self.email and self.invite_user:
	# 		self.create_website_user()
	@property
	def age(self):
		if not self.dob:
			return
		dob = getdate(self.dob)
		age = dateutil.relativedelta.relativedelta(getdate(), dob)
		return age

	def get_age(self):
		age = self.age
		if not age:
			return
		age_str = f'{str(age.years)} {_("Year(s)")} {str(age.months)} {_("Month(s)")} {str(age.days)} {_("Day(s)")}'
		return age_str

	def calculate_age(self, ref_date=None):
		if self.dob:
			if not ref_date:
				ref_date = frappe.utils.nowdate()
			diff = frappe.utils.date_diff(ref_date, self.dob)
			years = diff // 365
			months = (diff - (years * 365)) // 30
			days = (diff - (years * 365)) - (months * 30)
			return {
				"age_in_string": f'{str(years)} {_("Year(s)")} {str(months)} {_("Month(s)")} {str(days)} {_("Day(s)")}',
				"age_in_days": diff,
			}

def create_customer(doc):
	customer = frappe.get_doc(
		{
			"doctype": "Customer",
			"customer_name": doc.patient_name,
			"customer_group": doc.customer_group
			or frappe.db.get_single_value("Selling Settings", "customer_group"),
			"territory": doc.territory or frappe.db.get_single_value("Selling Settings", "territory"),
			"customer_type": "Individual",
			"default_currency": doc.default_currency,
			"default_price_list": doc.default_price_list,
			"language": doc.language,
			"image": doc.image,
		}
	).insert(ignore_permissions=True, ignore_mandatory=True)

	frappe.db.set_value("Patient", doc.name, "customer", customer.name)
	frappe.msgprint(_("Customer {0} created and linked to Patient").format(customer.name), alert=True)