import storyJson from './story.json'
import queueJson from './queue.json'
import activityJson from './activity.json'

// Types are inferred from the JSON written by pipeline/build_data.py.
export const story = storyJson
export const queue = queueJson
/** One entry per automation run that sent something: the date and the emails it sent. */
export const activity = activityJson
export type Story = typeof storyJson
export type QueueItem = (typeof queueJson)[number]
