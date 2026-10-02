
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_conversations": {
                  Row: {
                    "created_at": string,"id": string,"mode": string,"subject_id": string | null,"title": string,"topic_id": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"mode"?: string,"subject_id"?: string | null,"title"?: string,"topic_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"mode"?: string,"subject_id"?: string | null,"title"?: string,"topic_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_conversations_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_conversations_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_messages": {
                  Row: {
                    "citations": NonNullable<Json>,"content": string,"conversation_id": string,"created_at": string,"grounded": boolean | null,"id": string,"mode": string | null,"role": string,"user_id": string
                  }
                  Insert: {
                    "citations"?: NonNullable<Json>,"content": string,"conversation_id": string,"created_at"?: string,"grounded"?: boolean | null,"id"?: string,"mode"?: string | null,"role": string,"user_id": string
                  }
                  Update: {
                    "citations"?: NonNullable<Json>,"content"?: string,"conversation_id"?: string,"created_at"?: string,"grounded"?: boolean | null,"id"?: string,"mode"?: string | null,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "ai_conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_usage": {
                  Row: {
                    "created_at": string,"feature": string,"id": number,"input_tokens": number,"model": string,"output_tokens": number,"provider": string,"success": boolean,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"feature": string,"id"?: never,"input_tokens"?: number,"model": string,"output_tokens"?: number,"provider": string,"success"?: boolean,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"feature"?: string,"id"?: never,"input_tokens"?: number,"model"?: string,"output_tokens"?: number,"provider"?: string,"success"?: boolean,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"calendar_events": {
                  Row: {
                    "all_day": boolean,"completed": boolean,"created_at": string,"description": string | null,"end_at": string | null,"id": string,"start_at": string,"subject_id": string | null,"title": string,"type": Database["public"]['Enums']["event_type"],"user_id": string
                  }
                  Insert: {
                    "all_day"?: boolean,"completed"?: boolean,"created_at"?: string,"description"?: string | null,"end_at"?: string | null,"id"?: string,"start_at": string,"subject_id"?: string | null,"title": string,"type"?: Database["public"]['Enums']["event_type"],"user_id": string
                  }
                  Update: {
                    "all_day"?: boolean,"completed"?: boolean,"created_at"?: string,"description"?: string | null,"end_at"?: string | null,"id"?: string,"start_at"?: string,"subject_id"?: string | null,"title"?: string,"type"?: Database["public"]['Enums']["event_type"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_events_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                },"chapters": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"name": string,"owner_id": string | null,"sort_order": number,"subject_id": string,"weightage": number | null
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"owner_id"?: string | null,"sort_order"?: number,"subject_id": string,"weightage"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"owner_id"?: string | null,"sort_order"?: number,"subject_id"?: string,"weightage"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "chapters_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                },"education_systems": {
                  Row: {
                    "category": Database["public"]['Enums']["education_level"],"country": string | null,"created_at": string,"description": string | null,"id": string,"name": string,"owner_id": string | null
                  }
                  Insert: {
                    "category"?: Database["public"]['Enums']["education_level"],"country"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"owner_id"?: string | null
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["education_level"],"country"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"owner_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"error_logs": {
                  Row: {
                    "context": Json | null,"created_at": string,"id": number,"message": string,"source": string,"user_id": string | null
                  }
                  Insert: {
                    "context"?: Json | null,"created_at"?: string,"id"?: never,"message": string,"source": string,"user_id"?: string | null
                  }
                  Update: {
                    "context"?: Json | null,"created_at"?: string,"id"?: never,"message"?: string,"source"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"flashcard_reviews": {
                  Row: {
                    "flashcard_id": string | null,"id": string,"next_review_at": string,"rating": Database["public"]['Enums']["review_rating"],"reviewed_at": string,"topic_id": string | null,"user_id": string
                  }
                  Insert: {
                    "flashcard_id"?: string | null,"id"?: string,"next_review_at": string,"rating": Database["public"]['Enums']["review_rating"],"reviewed_at"?: string,"topic_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "flashcard_id"?: string | null,"id"?: string,"next_review_at"?: string,"rating"?: Database["public"]['Enums']["review_rating"],"reviewed_at"?: string,"topic_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "flashcard_reviews_flashcard_id_fkey"
      columns: ["flashcard_id"]
isOneToOne: false
      referencedRelation: "flashcards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "flashcard_reviews_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"flashcards": {
                  Row: {
                    "back": string,"created_at": string,"difficulty": number,"due_at": string,"ease_factor": number,"front": string,"id": string,"interval_days": number,"repetitions": number,"source_id": string | null,"source_type": string,"subject_id": string | null,"topic_id": string | null,"user_id": string
                  }
                  Insert: {
                    "back": string,"created_at"?: string,"difficulty"?: number,"due_at"?: string,"ease_factor"?: number,"front": string,"id"?: string,"interval_days"?: number,"repetitions"?: number,"source_id"?: string | null,"source_type"?: string,"subject_id"?: string | null,"topic_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "back"?: string,"created_at"?: string,"difficulty"?: number,"due_at"?: string,"ease_factor"?: number,"front"?: string,"id"?: string,"interval_days"?: number,"repetitions"?: number,"source_id"?: string | null,"source_type"?: string,"subject_id"?: string | null,"topic_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "flashcards_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "flashcards_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"past_paper_questions": {
                  Row: {
                    "created_at": string,"id": string,"marks": number | null,"page_number": number | null,"past_paper_id": string,"question_number": string,"question_text": string,"question_type": Database["public"]['Enums']["question_type"],"sort_order": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"marks"?: number | null,"page_number"?: number | null,"past_paper_id": string,"question_number": string,"question_text": string,"question_type"?: Database["public"]['Enums']["question_type"],"sort_order"?: number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"marks"?: number | null,"page_number"?: number | null,"past_paper_id"?: string,"question_number"?: string,"question_text"?: string,"question_type"?: Database["public"]['Enums']["question_type"],"sort_order"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "past_paper_questions_past_paper_id_fkey"
      columns: ["past_paper_id"]
isOneToOne: false
      referencedRelation: "past_papers"
      referencedColumns: ["id"]
    }
                  ]
                },"past_papers": {
                  Row: {
                    "created_at": string,"detected_subject": string | null,"id": string,"mime_type": string | null,"ocr_used": boolean,"processing_error": string | null,"processing_status": Database["public"]['Enums']["processing_status"],"session": string | null,"size_bytes": number | null,"storage_path": string | null,"subject_id": string,"title": string,"total_marks": number | null,"updated_at": string,"user_id": string,"year": number | null
                  }
                  Insert: {
                    "created_at"?: string,"detected_subject"?: string | null,"id"?: string,"mime_type"?: string | null,"ocr_used"?: boolean,"processing_error"?: string | null,"processing_status"?: Database["public"]['Enums']["processing_status"],"session"?: string | null,"size_bytes"?: number | null,"storage_path"?: string | null,"subject_id": string,"title": string,"total_marks"?: number | null,"updated_at"?: string,"user_id": string,"year"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"detected_subject"?: string | null,"id"?: string,"mime_type"?: string | null,"ocr_used"?: boolean,"processing_error"?: string | null,"processing_status"?: Database["public"]['Enums']["processing_status"],"session"?: string | null,"size_bytes"?: number | null,"storage_path"?: string | null,"subject_id"?: string,"title"?: string,"total_marks"?: number | null,"updated_at"?: string,"user_id"?: string,"year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "past_papers_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                },"processing_jobs": {
                  Row: {
                    "attempts": number,"created_at": string,"error": string | null,"finished_at": string | null,"id": string,"kind": Database["public"]['Enums']["job_kind"],"started_at": string | null,"status": Database["public"]['Enums']["job_status"],"target_id": string,"user_id": string
                  }
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["job_kind"],"started_at"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"target_id": string,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["job_kind"],"started_at"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"target_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"country": string | null,"created_at": string,"current_level": string | null,"daily_study_minutes": number,"education_level": Database["public"]['Enums']["education_level"] | null,"full_name": string | null,"id": string,"is_admin": boolean,"onboarding_completed": boolean,"study_days": (number)[],"timezone": string,"updated_at": string
                  }
                  Insert: {
                    "avatar_path"?: string | null,"country"?: string | null,"created_at"?: string,"current_level"?: string | null,"daily_study_minutes"?: number,"education_level"?: Database["public"]['Enums']["education_level"] | null,"full_name"?: string | null,"id": string,"is_admin"?: boolean,"onboarding_completed"?: boolean,"study_days"?: (number)[],"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_path"?: string | null,"country"?: string | null,"created_at"?: string,"current_level"?: string | null,"daily_study_minutes"?: number,"education_level"?: Database["public"]['Enums']["education_level"] | null,"full_name"?: string | null,"id"?: string,"is_admin"?: boolean,"onboarding_completed"?: boolean,"study_days"?: (number)[],"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"programs": {
                  Row: {
                    "created_at": string,"description": string | null,"education_system": string | null,"education_system_id": string | null,"id": string,"levels": (string)[],"name": string,"owner_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"education_system"?: string | null,"education_system_id"?: string | null,"id"?: string,"levels"?: (string)[],"name": string,"owner_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"education_system"?: string | null,"education_system_id"?: string | null,"id"?: string,"levels"?: (string)[],"name"?: string,"owner_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "programs_education_system_id_fkey"
      columns: ["education_system_id"]
isOneToOne: false
      referencedRelation: "education_systems"
      referencedColumns: ["id"]
    }
                  ]
                },"question_topic_links": {
                  Row: {
                    "confidence": number,"confirmed": boolean,"created_at": string,"id": string,"needs_review": boolean | null,"question_id": string,"source": Database["public"]['Enums']["link_source"],"topic_id": string,"user_id": string
                  }
                  Insert: {
                    "confidence"?: number,"confirmed"?: boolean,"created_at"?: string,"id"?: string,"needs_review"?: never,"question_id": string,"source"?: Database["public"]['Enums']["link_source"],"topic_id": string,"user_id": string
                  }
                  Update: {
                    "confidence"?: number,"confirmed"?: boolean,"created_at"?: string,"id"?: string,"needs_review"?: never,"question_id"?: string,"source"?: Database["public"]['Enums']["link_source"],"topic_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_topic_links_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "past_paper_questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_topic_links_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"questions": {
                  Row: {
                    "answer": string | null,"attempts": number,"bookmarked": boolean,"created_at": string,"difficulty": number,"id": string,"last_attempted_at": string | null,"marked_difficult": boolean,"marks": number | null,"note": string | null,"options": Json | null,"question_text": string,"question_type": Database["public"]['Enums']["question_type"],"solved_status": Database["public"]['Enums']["solved_status"],"source_id": string | null,"source_type": string,"subject_id": string | null,"topic_id": string | null,"user_id": string,"year": number | null
                  }
                  Insert: {
                    "answer"?: string | null,"attempts"?: number,"bookmarked"?: boolean,"created_at"?: string,"difficulty"?: number,"id"?: string,"last_attempted_at"?: string | null,"marked_difficult"?: boolean,"marks"?: number | null,"note"?: string | null,"options"?: Json | null,"question_text": string,"question_type"?: Database["public"]['Enums']["question_type"],"solved_status"?: Database["public"]['Enums']["solved_status"],"source_id"?: string | null,"source_type"?: string,"subject_id"?: string | null,"topic_id"?: string | null,"user_id": string,"year"?: number | null
                  }
                  Update: {
                    "answer"?: string | null,"attempts"?: number,"bookmarked"?: boolean,"created_at"?: string,"difficulty"?: number,"id"?: string,"last_attempted_at"?: string | null,"marked_difficult"?: boolean,"marks"?: number | null,"note"?: string | null,"options"?: Json | null,"question_text"?: string,"question_type"?: Database["public"]['Enums']["question_type"],"solved_status"?: Database["public"]['Enums']["solved_status"],"source_id"?: string | null,"source_type"?: string,"subject_id"?: string | null,"topic_id"?: string | null,"user_id"?: string,"year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "questions_source_id_fkey"
      columns: ["source_id"]
isOneToOne: true
      referencedRelation: "past_paper_questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "questions_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "questions_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"quiz_attempts": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"difficulty": string,"duration_seconds": number | null,"id": string,"items": NonNullable<Json>,"score": number,"subject_id": string | null,"topic_id": string | null,"total": number,"user_id": string
                  }
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"difficulty"?: string,"duration_seconds"?: number | null,"id"?: string,"items"?: NonNullable<Json>,"score"?: number,"subject_id"?: string | null,"topic_id"?: string | null,"total": number,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"difficulty"?: string,"duration_seconds"?: number | null,"id"?: string,"items"?: NonNullable<Json>,"score"?: number,"subject_id"?: string | null,"topic_id"?: string | null,"total"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_attempts_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quiz_attempts_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"resource_chunks": {
                  Row: {
                    "chunk_index": number,"content": string,"created_at": string,"embedding": string | null,"fts": unknown,"id": string,"page_number": number | null,"resource_id": string,"token_count": number | null,"topic_id": string | null,"user_id": string
                  }
                  Insert: {
                    "chunk_index": number,"content": string,"created_at"?: string,"embedding"?: string | null,"fts"?: never,"id"?: string,"page_number"?: number | null,"resource_id": string,"token_count"?: number | null,"topic_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "chunk_index"?: number,"content"?: string,"created_at"?: string,"embedding"?: string | null,"fts"?: never,"id"?: string,"page_number"?: number | null,"resource_id"?: string,"token_count"?: number | null,"topic_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "resource_chunks_resource_id_fkey"
      columns: ["resource_id"]
isOneToOne: false
      referencedRelation: "resources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resource_chunks_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"resources": {
                  Row: {
                    "ai_analysis": Json | null,"content": string | null,"created_at": string,"id": string,"mime_type": string | null,"page_count": number | null,"processing_error": string | null,"processing_status": Database["public"]['Enums']["processing_status"],"size_bytes": number | null,"storage_path": string | null,"subject_id": string | null,"suggested_subject_id": string | null,"summary": string | null,"tags": (string)[],"title": string,"type": Database["public"]['Enums']["resource_type"],"updated_at": string,"url": string | null,"user_id": string
                  }
                  Insert: {
                    "ai_analysis"?: Json | null,"content"?: string | null,"created_at"?: string,"id"?: string,"mime_type"?: string | null,"page_count"?: number | null,"processing_error"?: string | null,"processing_status"?: Database["public"]['Enums']["processing_status"],"size_bytes"?: number | null,"storage_path"?: string | null,"subject_id"?: string | null,"suggested_subject_id"?: string | null,"summary"?: string | null,"tags"?: (string)[],"title": string,"type": Database["public"]['Enums']["resource_type"],"updated_at"?: string,"url"?: string | null,"user_id": string
                  }
                  Update: {
                    "ai_analysis"?: Json | null,"content"?: string | null,"created_at"?: string,"id"?: string,"mime_type"?: string | null,"page_count"?: number | null,"processing_error"?: string | null,"processing_status"?: Database["public"]['Enums']["processing_status"],"size_bytes"?: number | null,"storage_path"?: string | null,"subject_id"?: string | null,"suggested_subject_id"?: string | null,"summary"?: string | null,"tags"?: (string)[],"title"?: string,"type"?: Database["public"]['Enums']["resource_type"],"updated_at"?: string,"url"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "resources_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resources_suggested_subject_id_fkey"
      columns: ["suggested_subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                },"student_programs": {
                  Row: {
                    "created_at": string,"id": string,"is_primary": boolean,"level": string | null,"program_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_primary"?: boolean,"level"?: string | null,"program_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_primary"?: boolean,"level"?: string | null,"program_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_programs_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"student_subjects": {
                  Row: {
                    "created_at": string,"exam_date": string | null,"id": string,"status": string,"subject_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"exam_date"?: string | null,"id"?: string,"status"?: string,"subject_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"exam_date"?: string | null,"id"?: string,"status"?: string,"subject_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_subjects_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                },"student_topic_progress": {
                  Row: {
                    "confidence": number | null,"ease_factor": number,"id": string,"interval_days": number,"last_studied_at": string | null,"mastery_score": number,"minutes_studied": number,"next_review_at": string | null,"notes": string | null,"quiz_correct": number,"quiz_total": number,"review_count": number,"status": Database["public"]['Enums']["topic_status"],"topic_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "confidence"?: number | null,"ease_factor"?: number,"id"?: string,"interval_days"?: number,"last_studied_at"?: string | null,"mastery_score"?: number,"minutes_studied"?: number,"next_review_at"?: string | null,"notes"?: string | null,"quiz_correct"?: number,"quiz_total"?: number,"review_count"?: number,"status"?: Database["public"]['Enums']["topic_status"],"topic_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "confidence"?: number | null,"ease_factor"?: number,"id"?: string,"interval_days"?: number,"last_studied_at"?: string | null,"mastery_score"?: number,"minutes_studied"?: number,"next_review_at"?: string | null,"notes"?: string | null,"quiz_correct"?: number,"quiz_total"?: number,"review_count"?: number,"status"?: Database["public"]['Enums']["topic_status"],"topic_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_topic_progress_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"study_plan_sessions": {
                  Row: {
                    "activity": Database["public"]['Enums']["plan_activity"],"completed_at": string | null,"created_at": string,"details": string | null,"duration": number,"goals": (string)[],"id": string,"priority": number,"scheduled_date": string,"sort_order": number,"start_time": string | null,"status": Database["public"]['Enums']["session_status"],"study_plan_id": string,"title": string,"topic_id": string | null,"user_id": string
                  }
                  Insert: {
                    "activity"?: Database["public"]['Enums']["plan_activity"],"completed_at"?: string | null,"created_at"?: string,"details"?: string | null,"duration": number,"goals"?: (string)[],"id"?: string,"priority"?: number,"scheduled_date": string,"sort_order"?: number,"start_time"?: string | null,"status"?: Database["public"]['Enums']["session_status"],"study_plan_id": string,"title": string,"topic_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "activity"?: Database["public"]['Enums']["plan_activity"],"completed_at"?: string | null,"created_at"?: string,"details"?: string | null,"duration"?: number,"goals"?: (string)[],"id"?: string,"priority"?: number,"scheduled_date"?: string,"sort_order"?: number,"start_time"?: string | null,"status"?: Database["public"]['Enums']["session_status"],"study_plan_id"?: string,"title"?: string,"topic_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "study_plan_sessions_study_plan_id_fkey"
      columns: ["study_plan_id"]
isOneToOne: false
      referencedRelation: "study_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "study_plan_sessions_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"study_plans": {
                  Row: {
                    "daily_minutes": number | null,"end_date": string | null,"exam_date": string | null,"generated_at": string,"id": string,"request": string | null,"skip_if_short": NonNullable<Json>,"start_date": string,"status": string,"strategy": NonNullable<Json>,"subject_id": string | null,"summary": string | null,"title": string,"user_id": string
                  }
                  Insert: {
                    "daily_minutes"?: number | null,"end_date"?: string | null,"exam_date"?: string | null,"generated_at"?: string,"id"?: string,"request"?: string | null,"skip_if_short"?: NonNullable<Json>,"start_date"?: string,"status"?: string,"strategy"?: NonNullable<Json>,"subject_id"?: string | null,"summary"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "daily_minutes"?: number | null,"end_date"?: string | null,"exam_date"?: string | null,"generated_at"?: string,"id"?: string,"request"?: string | null,"skip_if_short"?: NonNullable<Json>,"start_date"?: string,"status"?: string,"strategy"?: NonNullable<Json>,"subject_id"?: string | null,"summary"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "study_plans_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                },"study_sessions": {
                  Row: {
                    "confidence_after": number | null,"confidence_before": number | null,"duration": number | null,"ended_at": string | null,"goals": NonNullable<Json>,"id": string,"notes": string | null,"plan_session_id": string | null,"started_at": string,"status": Database["public"]['Enums']["session_status"],"topic_id": string | null,"user_id": string
                  }
                  Insert: {
                    "confidence_after"?: number | null,"confidence_before"?: number | null,"duration"?: number | null,"ended_at"?: string | null,"goals"?: NonNullable<Json>,"id"?: string,"notes"?: string | null,"plan_session_id"?: string | null,"started_at"?: string,"status"?: Database["public"]['Enums']["session_status"],"topic_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "confidence_after"?: number | null,"confidence_before"?: number | null,"duration"?: number | null,"ended_at"?: string | null,"goals"?: NonNullable<Json>,"id"?: string,"notes"?: string | null,"plan_session_id"?: string | null,"started_at"?: string,"status"?: Database["public"]['Enums']["session_status"],"topic_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "study_sessions_plan_session_id_fkey"
      columns: ["plan_session_id"]
isOneToOne: false
      referencedRelation: "study_plan_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "study_sessions_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"subjects": {
                  Row: {
                    "code": string | null,"color": string,"created_at": string,"description": string | null,"id": string,"name": string,"owner_id": string | null,"program_id": string | null,"sort_order": number,"template_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "code"?: string | null,"color"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"owner_id"?: string | null,"program_id"?: string | null,"sort_order"?: number,"template_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string | null,"color"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"owner_id"?: string | null,"program_id"?: string | null,"sort_order"?: number,"template_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subjects_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subjects_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                },"syllabus_imports": {
                  Row: {
                    "created_at": string,"error": string | null,"id": string,"program_id": string | null,"result": Json | null,"saved": boolean,"source_text": string | null,"source_type": string,"status": Database["public"]['Enums']["processing_status"],"storage_path": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"id"?: string,"program_id"?: string | null,"result"?: Json | null,"saved"?: boolean,"source_text"?: string | null,"source_type": string,"status"?: Database["public"]['Enums']["processing_status"],"storage_path"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"id"?: string,"program_id"?: string | null,"result"?: Json | null,"saved"?: boolean,"source_text"?: string | null,"source_type"?: string,"status"?: Database["public"]['Enums']["processing_status"],"storage_path"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "syllabus_imports_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"description": string | null,"due_at": string | null,"id": string,"priority": Database["public"]['Enums']["task_priority"],"status": Database["public"]['Enums']["task_status"],"subject_id": string | null,"title": string,"topic_id": string | null,"type": Database["public"]['Enums']["task_type"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"due_at"?: string | null,"id"?: string,"priority"?: Database["public"]['Enums']["task_priority"],"status"?: Database["public"]['Enums']["task_status"],"subject_id"?: string | null,"title": string,"topic_id"?: string | null,"type"?: Database["public"]['Enums']["task_type"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"due_at"?: string | null,"id"?: string,"priority"?: Database["public"]['Enums']["task_priority"],"status"?: Database["public"]['Enums']["task_status"],"subject_id"?: string | null,"title"?: string,"topic_id"?: string | null,"type"?: Database["public"]['Enums']["task_type"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"topic_resource_links": {
                  Row: {
                    "confidence": number | null,"confirmed": boolean,"created_at": string,"id": string,"resource_id": string,"source": Database["public"]['Enums']["link_source"],"topic_id": string,"user_id": string
                  }
                  Insert: {
                    "confidence"?: number | null,"confirmed"?: boolean,"created_at"?: string,"id"?: string,"resource_id": string,"source"?: Database["public"]['Enums']["link_source"],"topic_id": string,"user_id": string
                  }
                  Update: {
                    "confidence"?: number | null,"confirmed"?: boolean,"created_at"?: string,"id"?: string,"resource_id"?: string,"source"?: Database["public"]['Enums']["link_source"],"topic_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "topic_resource_links_resource_id_fkey"
      columns: ["resource_id"]
isOneToOne: false
      referencedRelation: "resources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "topic_resource_links_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"topics": {
                  Row: {
                    "chapter_id": string,"created_at": string,"description": string | null,"difficulty": number,"embedding": string | null,"estimated_minutes": number,"id": string,"learning_objectives": (string)[],"name": string,"owner_id": string | null,"parent_topic_id": string | null,"sort_order": number,"subject_id": string,"weightage": number | null
                  }
                  Insert: {
                    "chapter_id": string,"created_at"?: string,"description"?: string | null,"difficulty"?: number,"embedding"?: string | null,"estimated_minutes"?: number,"id"?: string,"learning_objectives"?: (string)[],"name": string,"owner_id"?: string | null,"parent_topic_id"?: string | null,"sort_order"?: number,"subject_id": string,"weightage"?: number | null
                  }
                  Update: {
                    "chapter_id"?: string,"created_at"?: string,"description"?: string | null,"difficulty"?: number,"embedding"?: string | null,"estimated_minutes"?: number,"id"?: string,"learning_objectives"?: (string)[],"name"?: string,"owner_id"?: string | null,"parent_topic_id"?: string | null,"sort_order"?: number,"subject_id"?: string,"weightage"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "topics_chapter_id_fkey"
      columns: ["chapter_id"]
isOneToOne: false
      referencedRelation: "chapters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "topics_parent_topic_id_fkey"
      columns: ["parent_topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "topics_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "assert_owns":
{ Args: { "allow_template"?: boolean,"row_id": string,"tbl": unknown,"uid": string }; Returns: undefined
                           },
"clone_subject_template":
{ Args: { "p_exam_date"?: string,"p_template_id": string }; Returns: string
                           },
"create_demo_workspace":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"match_resource_chunks":
{ Args: { "filter_resource_id"?: string,"filter_subject_id"?: string,"filter_topic_id"?: string,"match_count"?: number,"query_embedding"?: string,"query_text": string }; Returns: {
              "chunk_id": string,"content": string,"page_number": number,"resource_id": string,"resource_title": string,"resource_type": Database["public"]['Enums']["resource_type"],"score": number,"similarity": number,"topic_id": string
            }[]
                           },
"match_topics":
{ Args: { "filter_subject_id"?: string,"match_count"?: number,"min_similarity"?: number,"query_embedding": string }; Returns: {
              "name": string,"similarity": number,"subject_id": string,"topic_id": string
            }[]
                           },
"match_topics_for_user":
{ Args: { "filter_subject_id"?: string,"match_count"?: number,"min_similarity"?: number,"p_user_id": string,"query_embedding": string }; Returns: {
              "similarity": number,"topic_id": string
            }[]
                           },
"save_syllabus":
{ Args: { "p_payload": Json,"p_program_id"?: string }; Returns: (string)[]
                           },
"search_workspace":
{ Args: { "p_limit"?: number,"p_query": string }; Returns: {
              "id": string,"kind": string,"parent_id": string,"rank": number,"snippet": string,"subject_id": string,"title": string
            }[]
                           },
"subject_topic_stats":
{ Args: { "p_subject_id": string }; Returns: {
              "chapter_id": string,"chapter_name": string,"last_year": number,"paper_count": number,"question_count": number,"topic_id": string,"topic_name": string,"total_marks": number,"years": (number)[]
            }[]
                           }
          }
          Enums: {
            "education_level": "university"|"ca"|"acca"|"cfa"|"mdcat"|"ecat"|"css"|"a_level"|"o_level"|"college"|"professional"|"other","event_type": "exam"|"assignment"|"quiz"|"class"|"study_session"|"deadline"|"revision","job_kind": "resource"|"past_paper"|"syllabus","job_status": "queued"|"running"|"succeeded"|"failed","link_source": "ai"|"user","plan_activity": "learn"|"practice"|"past_paper"|"revise"|"recall"|"mock"|"break","processing_status": "uploading"|"processing"|"analyzing"|"ready"|"failed","question_type": "mcq"|"short"|"long"|"numerical"|"theory"|"case_study","resource_type": "pdf"|"docx"|"pptx"|"txt"|"image"|"youtube"|"web"|"drive"|"note","review_rating": "again"|"hard"|"good"|"easy","session_status": "planned"|"in_progress"|"done"|"skipped","solved_status": "unsolved"|"attempted"|"solved"|"needs_review","task_priority": "low"|"medium"|"high","task_status": "todo"|"in_progress"|"done","task_type": "assignment"|"project"|"quiz"|"exam"|"application"|"registration"|"study"|"other","topic_status": "not_started"|"learning"|"practicing"|"reviewed"|"mastered"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "education_level": ["university", "ca", "acca", "cfa", "mdcat", "ecat", "css", "a_level", "o_level", "college", "professional", "other"],"event_type": ["exam", "assignment", "quiz", "class", "study_session", "deadline", "revision"],"job_kind": ["resource", "past_paper", "syllabus"],"job_status": ["queued", "running", "succeeded", "failed"],"link_source": ["ai", "user"],"plan_activity": ["learn", "practice", "past_paper", "revise", "recall", "mock", "break"],"processing_status": ["uploading", "processing", "analyzing", "ready", "failed"],"question_type": ["mcq", "short", "long", "numerical", "theory", "case_study"],"resource_type": ["pdf", "docx", "pptx", "txt", "image", "youtube", "web", "drive", "note"],"review_rating": ["again", "hard", "good", "easy"],"session_status": ["planned", "in_progress", "done", "skipped"],"solved_status": ["unsolved", "attempted", "solved", "needs_review"],"task_priority": ["low", "medium", "high"],"task_status": ["todo", "in_progress", "done"],"task_type": ["assignment", "project", "quiz", "exam", "application", "registration", "study", "other"],"topic_status": ["not_started", "learning", "practicing", "reviewed", "mastered"]
          }
        }
} as const

