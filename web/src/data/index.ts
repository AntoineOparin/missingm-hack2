import storyJson from './story.json'
import queueJson from './queue.json'

// Types are inferred from the JSON written by pipeline/build_data.py.
export const story = storyJson
export const queue = queueJson
export type Story = typeof storyJson
export type QueueItem = (typeof queueJson)[number]
