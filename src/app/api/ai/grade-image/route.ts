// @ts-nocheck
// POST /api/ai/grade-image
// Input: { mediaId, question, modelAnswer, acceptedAnswers?, maxPoints? }
// Output: { extractedAnswer, isCorrect, feedback, awardedPoints, maxPoints }
//
// Calls Gemini with the student's uploaded image + question + model answer
// Extracts the answer from the image and compares it to the model answer.

import { NextResponse } from 'next/server'
import { gradeImageAnswer } from '@/lib/ai-image-grader'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    var body = await request.json()
    var result = await gradeImageAnswer({
      mediaId: body.mediaId,
      question: body.question || '',
      modelAnswer: body.modelAnswer || '',
      acceptedAnswers: Array.isArray(body.acceptedAnswers) ? body.acceptedAnswers : [],
      maxPoints: typeof body.maxPoints === 'number' ? body.maxPoints : 5,
    })

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error('[AI Grade Image] Error:', error)
    return NextResponse.json({
      extractedAnswer: '',
      isCorrect: false,
      feedback: 'خطأ في التصحيح',
      awardedPoints: 0,
      maxPoints: 5,
      error: error.message || 'Server error',
    }, { status: 200 })
  }
}
