import { StepConfig } from '~types/steps'
import { useCallback, useRef, useState } from 'preact/hooks'

import { formatStep } from '../../index'
import { NarrowSdkOptions, UrlsConfig } from '~types/commons'
import {
  StepsProviderStatus,
  StepsProvider,
  CompleteStepValue,
} from '~types/routers'
import { poller, PollFunc, Engine } from '../WorkflowEngine'
import type { WorkflowResponse } from '../WorkflowEngine/utils/WorkflowTypes'
import useUserConsent from '~contexts/useUserConsent'

type StepsProviderState = {
  status: StepsProviderStatus
  steps: StepConfig[]
  taskId: string | undefined
  error: string | undefined
}

const defaultState: StepsProviderState = {
  status: 'idle',
  taskId: undefined,
  error: undefined,
  steps: [],
}

export const createWorkflowStepsProvider = (
  { token, workflowRunId, ...options }: NarrowSdkOptions,
  { onfido_api_url }: UrlsConfig
): StepsProvider => () => {
  const { enabled, consents } = useUserConsent()

  const [state, setState] = useState<StepsProviderState>(() => {
    if (!enabled) {
      return { ...defaultState, steps: options.steps }
    }

    //@todo: We should move the logic of enforcing the steps from index.ts here
    return {
      ...defaultState,
      steps: [
        ...options.steps.slice(0, 1),
        {
          type: 'userConsent',
          options: {
            skip: consents.every(
              (c) => !c.required || (c.required && c.granted)
            ),
          },
        },
        ...options.steps.slice(1),
      ],
    }
  })

  const { taskId, status, error, steps } = state

  const docData = useRef<Array<unknown>>([])
  const personalData = useRef({})

  const pollStep = useCallback((cb: () => void) => {
    if (!token) {
      throw new Error('No token provided')
    }

    if (!workflowRunId) {
      throw new Error('No workflowRunId provided')
    }

    const workflowEngine = new Engine({
      token,
      workflowRunId,
      workflowServiceUrl: `${onfido_api_url}/v4`,
    })

    poller(async (poll: PollFunc) => {
      let workflow: WorkflowResponse | undefined

      try {
        workflow = await workflowEngine.getWorkflow()
      } catch {
        setState((state) => ({
          ...state,
          status: 'error',
          error: 'Workflow run ID is not set.',
        }))
      }

      if (!workflow) {
        setState((state) => ({
          ...state,
          status: 'error',
          error: 'Workflow run ID is not set.',
        }))
        return
      }

      console.log('workflow loaded: ', workflow)

      if (workflow.finished || !workflow.has_remaining_interactive_tasks) {
        setState((state) => ({
          ...state,
          status: 'finished',
          taskId: workflow?.task_id,
          // @ts-ignore
          steps: [formatStep(workflowEngine.getOutcomeStep(workflow))],
        }))
        cb()
        return
      }

      // continue polling until interactive task is found
      if (workflow?.task_type !== 'INTERACTIVE') {
        console.log(`Non interactive workflow task, keep polling`)
        poll(1500)
        return
      }

      const step = workflowEngine.getWorkFlowStep(
        workflow.task_def_id,
        workflow.config
      )

      if (!step) {
        setState((state) => ({
          ...state,
          status: 'error',
          error: 'Task is currently not supported.',
        }))
        return
      }

      setState((state) => ({
        ...state,
        status: 'success',
        steps: [formatStep(step)],
        taskId: workflow?.task_id,
      }))
      cb()
    })
  }, [])

  const completeStep = useCallback((data: CompleteStepValue) => {
    if (Array.isArray(data)) {
      docData.current = [...docData.current, ...data]
    } else {
      personalData.current = { ...personalData.current, ...data }
    }
  }, [])

  const loadNextStep = useCallback(
    (cb: () => void) => {
      if (!workflowRunId) {
        throw new Error('No token provided')
      }

      if (!token) {
        throw new Error('No token provided')
      }

      setState((state) => ({
        ...state,
        status: 'loading',
      }))

      if (!taskId) {
        pollStep(cb)
        return
      }

      const workflowEngine = new Engine({
        token,
        workflowRunId,
        workflowServiceUrl: `${onfido_api_url}/v4`,
      })

      workflowEngine
        .completeWorkflow(taskId, personalData.current, docData.current)
        .then(() => {
          setState((state) => ({
            ...state,
            taskId: undefined,
          }))
          docData.current = []
          personalData.current = {}
        })
        .catch(() =>
          setState((state) => ({
            ...state,
            status: 'error',
            error: 'Could not complete workflow task.',
          }))
        )
        .finally(() => pollStep(cb))
    },
    [pollStep, docData, personalData, taskId]
  )

  return {
    completeStep,
    loadNextStep,
    status,
    steps,
    error,
  }
}
