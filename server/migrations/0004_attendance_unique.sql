-- One active attendance record per ticket; undo removes it before a new check-in.
CREATE UNIQUE INDEX IF NOT EXISTS check_ins_one_per_guest ON check_ins(guest_id);
