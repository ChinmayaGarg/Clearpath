-- Migration 030: Create cancellation_request table for student cancellation requests workflow
-- Purpose: Track cancellation requests submitted by students for approved/confirmed exam bookings
-- Workflow: Student submits request → Admin approves/rejects → Status updated

CREATE TABLE IF NOT EXISTS :schema_name.cancellation_request (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_booking_request_id UUID NOT NULL REFERENCES :schema_name.exam_booking_request(id) ON DELETE CASCADE,
    student_profile_id UUID NOT NULL REFERENCES :schema_name.student_profile(id) ON DELETE CASCADE,
    student_reason TEXT NOT NULL,
    request_status TEXT NOT NULL CHECK (request_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    admin_profile_id UUID REFERENCES :schema_name."user"(id) ON DELETE SET NULL,
    admin_reason TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cancellation_request_exam_id ON :schema_name.cancellation_request(exam_booking_request_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_request_student_id ON :schema_name.cancellation_request(student_profile_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_request_status ON :schema_name.cancellation_request(request_status);
CREATE INDEX IF NOT EXISTS idx_cancellation_request_student_status ON :schema_name.cancellation_request(student_profile_id, request_status);
