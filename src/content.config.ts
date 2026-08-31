import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const trips = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/trips' }),
  schema: z.object({
    title: z.string(),
    year: z.number(),
    startDate: z.string(),
    endDate: z.string(),
    days: z.number(),
    miles: z.number(),
    elevationGain: z.number().optional(),
    startPoint: z.string(),
    endPoint: z.string(),
    trail: z.enum(['PCT', 'JMT', 'other']).default('PCT'),
    pctMileStart: z.number().optional(),
    pctMileEnd: z.number().optional(),
    description: z.string(),
    tags: z.array(z.string()),
    coordinates: z.array(z.tuple([z.number(), z.number()])).optional().default([]),
    color: z.string(),
    highlights: z.array(z.string()).optional(),
    coverImage: z.string().optional(),
    routeFile: z.string().optional(),
    annotations: z.array(z.object({
      type: z.enum(['campsite', 'water', 'notable', 'viewpoint', 'trailhead']),
      label: z.string(),
      note: z.string().optional(),
      coordinates: z.tuple([z.number(), z.number()]),
    })).optional(),
    photos: z.array(z.object({
      id: z.string(),
      alt: z.string().optional(),
      caption: z.string().optional(),
    })).optional(),
  }),
});

export const collections = { trips };
