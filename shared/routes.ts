import { z } from 'zod';
import { insertRecordingSchema, recordings, userStats } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  paymentRequired: z.object({
    message: z.string(),
  })
};

export const api = {
  user: {
    getStats: {
      method: 'GET' as const,
      path: '/api/user/stats',
      responses: {
        200: z.custom<typeof userStats.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    updateSettings: {
      method: 'PATCH' as const,
      path: '/api/user/settings',
      input: z.object({
        dyslexiaFont: z.boolean().optional(),
        highContrast: z.boolean().optional(),
        darkMode: z.boolean().optional(),
        voiceSpeed: z.string().optional(),
      }),
      responses: {
        200: z.custom<typeof userStats.$inferSelect>(),
      },
    },
  },
  recordings: {
    list: {
      method: 'GET' as const,
      path: '/api/recordings',
      responses: {
        200: z.array(z.custom<typeof recordings.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/recordings/:id',
      responses: {
        200: z.custom<typeof recordings.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/recordings',
      input: insertRecordingSchema,
      responses: {
        201: z.custom<typeof recordings.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    process: {
      method: 'POST' as const,
      path: '/api/recordings/:id/process',
      responses: {
        200: z.custom<typeof recordings.$inferSelect>(), // Returns updated recording with 'processing' status or 'completed'
        402: errorSchemas.paymentRequired,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/recordings/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    createQuiz: {
      method: 'POST' as const,
      path: '/api/recordings/:id/quiz',
      responses: {
        200: z.custom<typeof recordings.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
