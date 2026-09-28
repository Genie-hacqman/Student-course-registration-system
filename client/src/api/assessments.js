import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from './client'

const keys = {
  section: (id) => ['assessments', 'section', String(id)],
  scores: (id) => ['assessments', 'scores', String(id)],
  mine: ['assessments', 'me'],
}

export const ASSESSMENT_TYPES = ['quiz', 'assignment', 'midterm', 'exam', 'project', 'other']

export const useSectionAssessments = (sectionId) =>
  useQuery({ queryKey: keys.section(sectionId), queryFn: () => api.get(`/sections/${sectionId}/assessments`).then(unwrap), enabled: Boolean(sectionId) })

export const useAssessmentScores = (id) =>
  useQuery({ queryKey: keys.scores(id), queryFn: () => api.get(`/assessments/${id}/scores`).then(unwrap), enabled: Boolean(id) })

export const useMyAssessments = () =>
  useQuery({ queryKey: keys.mine, queryFn: () => api.get('/students/me/assessments').then(unwrap) })

const useAssessmentMutation = (fn) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['assessments'] }),
      qc.invalidateQueries({ queryKey: ['lecturer', 'tasks'] }),
    ]),
  })
}

export const useCreateAssessment = () =>
  useAssessmentMutation(({ sectionId, ...body }) => api.post(`/sections/${sectionId}/assessments`, body).then(unwrap))
export const useUpdateAssessment = () =>
  useAssessmentMutation(({ id, ...body }) => api.patch(`/assessments/${id}`, body).then(unwrap))
export const useDeleteAssessment = () => useAssessmentMutation((id) => api.delete(`/assessments/${id}`))
export const useSaveScores = () =>
  useAssessmentMutation(({ id, scores }) => api.put(`/assessments/${id}/scores`, { scores }).then(unwrap))
export const usePublishAssessment = () => useAssessmentMutation((id) => api.post(`/assessments/${id}/publish`).then(unwrap))
