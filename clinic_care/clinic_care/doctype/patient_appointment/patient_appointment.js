// Copyright (c) 2025, Soft Served Web and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Patient Appointment", {
// 	refresh(frm) {

// 	},
// });
frappe.ui.form.on('Patient Appointment', {
    refresh: function(frm) {
        frm.set_query('patient', function() {
            return {
                filters: { 'status': 'Active' }
            };
        });

        frm.set_query('practitioner', function() {
            return {
                filters: {
                    'status': 'Active'
                }
            };
        });

        if (frm.is_new()) {
            frm.set_value('appointment_time', null);
            frm.disable_save();
            frm.page.set_primary_action(__('Check Availability'), function() {
                if (!frm.doc.patient) {
                    frappe.msgprint({
                        title: __('Not Allowed'),
                        message: __('Please select Patient first'),
                        indicator: 'red'
                    });
                } else if (!frm.doc.practitioner) {
                    frappe.msgprint({
                        title: __('Not Allowed'),
                        message: __('Please select Practitioner first'),
                        indicator: 'red'
                    });
                } else {
                    check_and_set_availability(frm);
                }
            });
        } else {
            frm.page.set_primary_action(__('Save'), () => frm.save());
        }

        if (["Scheduled", "Open"].includes(frm.doc.status) && !frm.doc.__islocal) {
            frm.add_custom_button(__('Cancel'), function() {
                update_status(frm, 'Cancelled');
            });
        }
    },

    patient: function(frm) {
        if (!frm.doc.patient) {
            frm.set_value('patient_name', '');
        }
    },

    practitioner: function(frm) {
        if (!frm.doc.practitioner) {
            frm.set_value('practitioner_name', '');
        }
    },

    appointment_date: function(frm) {
        set_appointment_datetime(frm);
    },

    appointment_time: function(frm) {
        set_appointment_datetime(frm);
    }
});

let set_appointment_datetime = function(frm) {
    if (frm.doc.appointment_date && frm.doc.appointment_time) {
        frm.set_value('a.clinic_careppointment_datetime', 
            frappe.datetime.get_datetime_as_string(frm.doc.appointment_date + " " + frm.doc.appointment_time));
    }
};

let check_and_set_availability = function(frm) {
    let selected_slot = null;
    let duration = null;
    let add_video_conferencing = null;

    show_availability();

    function show_empty_state(practitioner, appointment_date) {
        frappe.msgprint({
            title: __('Not Available'),
            message: __('Healthcare Practitioner {0} not available on {1}', [practitioner.bold(), appointment_date.bold()]),
            indicator: 'red'
        });
    }

    function show_availability() {
        let d = new frappe.ui.Dialog({
            title: __('Available slots'),
            fields: [
                { fieldtype: 'Date', reqd: 1, fieldname: 'appointment_date', label: 'Date', min_date: new Date(frappe.datetime.get_today()) },
                { fieldtype: 'Section Break' },
                { fieldtype: 'HTML', fieldname: 'available_slots' },
            ],
            primary_action_label: __('Book'),
            primary_action: function() {
                console.log(selected_slot);
                frm.set_value('appointment_time', selected_slot);
                // frm.set_value('add_video_conferencing', add_video_conferencing && !d.$wrapper.find(".opt-out-check").is(":checked"));
                
                if (!frm.doc.duration) {
                    frm.set_value('duration', duration);
                }
                
                frm.set_value('appointment_date', d.get_value('appointment_date'));
                
                d.hide();
                frm.enable_save();
                frm.save();
            }
        });

        // Disable dialog action initially
        d.get_primary_btn().attr('disabled', true);

        // Set initial date
        d.set_value('appointment_date', frm.doc.appointment_date || frappe.datetime.get_today());

        // When date changes, update slots
        d.fields_dict['appointment_date'].df.onchange = () => {
            show_slots(d, d.fields_dict);
        };

        d.show();
        
        // Init slots
        show_slots(d, d.fields_dict);
    }

    function show_slots(d, fd) {
        if (d.get_value('appointment_date')) {
            fd.available_slots.html('');
            
            frappe.call({
                method: 'clinic_care.clinic_care.doctype.patient_appointment.patient_appointment.get_availability_data',
                args: {
                    practitioner: frm.doc.practitioner,
                    date: d.get_value('appointment_date'),
                    appointment: frm.doc
                },
                callback: (r) => {
                    let data = r.message;
                    if (data.slot_details.length > 0) {
                        let $wrapper = d.fields_dict.available_slots.$wrapper;

                        // Make buttons for each slot
                        let slot_html = get_slots(data.slot_details, d.get_value('appointment_date'));

                        $wrapper
                            .css('margin-bottom', 0)
                            .addClass('text-center')
                            .html(slot_html);

                        // Highlight button when clicked
                        $wrapper.on('click', 'button', function() {
                            let $btn = $(this);
                            $wrapper.find('button').removeClass('btn-outline-primary');
                            $btn.addClass('btn-outline-primary');
                            selected_slot = $btn.attr('data-name');
                            duration = parseInt($btn.attr('data-duration'));
                            // add_video_conferencing = parseInt($btn.attr('data-tele-conf'));
                            
                            // Show option to opt out of tele conferencing
                            if ($btn.attr('data-tele-conf') == 1) {
                                if (d.$wrapper.find(".opt-out-conf-div").length) {
                                    d.$wrapper.find(".opt-out-conf-div").show();
                                } else {
                                    d.footer.prepend(
                                        `<div class="opt-out-conf-div ellipsis" style="vertical-align:text-bottom;">
                                        <label>
                                            <input type="checkbox" class="opt-out-check"/>
                                            <span class="label-area">
                                            ${__("Do not add Video Conferencing")}
                                            </span>
                                        </label>
                                    </div>`
                                    );
                                }
                            } else {
                                d.$wrapper.find(".opt-out-conf-div").hide();
                            }

                            // Enable primary action 'Book'
                            d.get_primary_btn().attr('disabled', null);
                        });

                    } else {
                        show_empty_state(frm.doc.practitioner, d.get_value('appointment_date'));
                    }
                },
                freeze: true,
                freeze_message: __('Fetching Schedule...')
            });
        } else {
            fd.available_slots.html(__('Appointment date is required').bold());
        }
    }

    function get_slots(slot_details, appointment_date) {
        let slot_html = '';
        let appointment_count = 0;
        let disabled = false;
        let start_str, slot_start_time, slot_end_time, interval;

        slot_details.forEach((slot_info) => {
            slot_html += `<div class="slot-info">
                <span><b>${__('Practitioner Schedule: ')} </b> ${slot_info.slot_name}
                    ${slot_info.tele_conf ? '<i class="fa fa-video-camera fa-1x" aria-hidden="true"></i>' : ''}
                </span>
            </div><br>`;

            slot_html += slot_info.avail_slot.map(slot => {
                appointment_count = 0;
                disabled = false;
                start_str = slot.from_time;
                slot_start_time = moment(slot.from_time, 'HH:mm:ss');
                slot_end_time = moment(slot.to_time, 'HH:mm:ss');
                interval = (slot_end_time - slot_start_time) / 60000 | 0;

                // Restrict past slots based on the current time
                let now = moment();
                let booked_moment = "";
                if ((now.format("YYYY-MM-DD") == appointment_date) && (slot_start_time.isBefore(now) && !slot.maximum_appointments)) {
                    disabled = true;
                } else {
                    // Check for conflicts with existing appointments
                    slot_info.appointments.forEach((booked) => {
                        booked_moment = moment(booked.appointment_time, 'HH:mm:ss');
                        let end_time = booked_moment.clone().add(booked.duration, 'minutes');

                        // Check for slot conflict
                        if (slot_start_time.isBefore(end_time) && slot_end_time.isAfter(booked_moment)) {
                            disabled = true;
                            return false;
                        }
                    });
                }

                if (slot.maximum_appointments) {
                    // Handle group appointments
                    slot_info.appointments.forEach((booked) => {
                        if (booked.appointment_date == appointment_date && 
                            booked_moment.isSame(slot_start_time)) {
                            appointment_count++;
                        }
                    });
                    
                    if (appointment_count >= slot.maximum_appointments) {
                        disabled = true;
                    }
                    
                    return `<button class="btn btn-secondary" data-name=${start_str}
                        data-duration=${slot.duration}
                        data-tele-conf="${slot_info.tele_conf || 0}"
                        style="margin: 0 10px 10px 0; width: auto;" ${disabled ? 'disabled="disabled"' : ""}>
                        ${start_str.substring(0, start_str.length - 3)} - 
                        ${slot.to_time.substring(0, slot.to_time.length - 3)}
                        <br><span class='badge ${disabled ? 'badge-danger' : 'badge-success'}'>${disabled ? 'Full' : (slot.maximum_appointments - appointment_count)}</span>
                    </button>`;
                } else {
                    // Individual appointment slots
                    return `<button class="btn btn-secondary" data-name=${start_str}
                        data-duration=${interval}
                        data-tele-conf="${slot_info.tele_conf || 0}"
                        style="margin: 0 10px 10px 0; width: auto;" ${disabled ? 'disabled="disabled"' : ""}>
                        ${start_str.substring(0, start_str.length - 3)}
                    </button>`;
                }
            }).join("");

            slot_html += `<br/><br/>`;
        });

        return slot_html;
    }
};

let update_status = function(frm, status) {
    let doc = frm.doc;
    frappe.confirm(__('Are you sure you want to cancel this appointment?'),
        function() {
            frappe.call({
                method: 'clinic_care.clinic_care.doctype.patient_appointment.patient_appointment.update_status',
                args: { appointment_id: doc.name, status: status },
                callback: function(data) {
                    if (!data.exc) {
                        frm.reload_doc();
                    }
                }
            });
        }
    );
};