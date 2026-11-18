import type { PipelineStage } from 'mongoose';
import { Course, Enrolment, User } from '../models.js';

/**
 * Aggregation stages that restrict Enrolment documents strictly to:
 * 1. status === 'active'
 * 2. userId referencing an existing User document in MongoDB
 * 3. courseId referencing an existing Course document in MongoDB
 *
 * This prevents deleted users, deleted courses, or revoked enrolments from
 * ever inflating enrolment counts even if records were removed directly in the DB.
 */
export function buildValidActiveEnrolmentPipeline(): PipelineStage[] {
  return [
    { $match: { status: 'active' } },
    {
      $lookup: {
        from: User.collection.name,
        localField: 'userId',
        foreignField: '_id',
        as: '_user',
      },
    },
    { $unwind: '$_user' },
    {
      $lookup: {
        from: Course.collection.name,
        localField: 'courseId',
        foreignField: '_id',
        as: '_course',
      },
    },
    { $unwind: '$_course' },
  ];
}

export async function countValidActiveEnrolments(): Promise<number> {
  const rows = await Enrolment.aggregate<{ total: number }>([
    ...buildValidActiveEnrolmentPipeline(),
    { $count: 'total' },
  ]);
  return Number(rows[0]?.total || 0);
}

export async function getValidActiveEnrolmentCountsByCourse(): Promise<Map<string, number>> {
  const rows = await Enrolment.aggregate<{ _id: unknown; count: number }>([
    ...buildValidActiveEnrolmentPipeline(),
    { $group: { _id: '$courseId', count: { $sum: 1 } } },
  ]);

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row._id) {
      counts.set(String(row._id), Number(row.count || 0));
    }
  }
  return counts;
}
