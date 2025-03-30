// Copyright (c) 2025, Soft Served Web and contributors
// For license information, please see license.txt

frappe.ui.form.on("Patient", {
    onload: function (frm) {
        if (frm.doc.dob) {
            $(frm.fields_dict['age_html'].wrapper).html(`${__('AGE')} : ${get_age(frm.doc.dob)}`);
        } else {
            $(frm.fields_dict['age_html'].wrapper).html('');
        }
    }
});

frappe.ui.form.on('Patient', 'dob', function (frm) {
    if (frm.doc.dob) {
        let today = new Date();
        let birthDate = new Date(frm.doc.dob);
        if (today < birthDate) {
            frappe.msgprint(__('Please select a valid Date'));
            frappe.model.set_value(frm.doctype, frm.docname, 'dob', '');
        } else {
            let age_str = get_age(frm.doc.dob);
            $(frm.fields_dict['age_html'].wrapper).html(`${__('AGE')} : ${age_str}`);
        }
    } else {
        $(frm.fields_dict['age_html'].wrapper).html('');
    }
});

let get_age = function (birth) {
    let birth_moment = moment(birth);
    let current_moment = moment(Date());
    let diff = moment.duration(current_moment.diff(birth_moment));
    return `${diff.years()} ${__('Year(s)')} ${diff.months()} ${__('Month(s)')} ${diff.days()} ${__('Day(s)')}`
};