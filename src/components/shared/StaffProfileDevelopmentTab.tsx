import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOrgTimezone } from '../../hooks/useOrgTimezone'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import type { ProductConfig, ProductFeatures, ProductTerminology } from '../../lib/productConfig'
import { formatInOrgTz } from '../../utils/formatTime'

const DATE_DISPLAY_FORMAT = 'MMM d, yyyy'

const DEFAULT_CIT_COURSE_NAMES = [
  'Running an Event',
  'Venues and Outdoor Locations',
  'GMHQ Captain Tools and Processes',
] as const

export type DevelopmentCourseStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Passed'
  | 'Failed'

export interface AssignedDevelopmentCourse {
  id: string
  courseName: string
  assignedDate: string
  status: DevelopmentCourseStatus
  passDate: string | null
}

export interface CitOjtEvent {
  eventName: string
  eventDate: string
}

export interface StaffProfileDevelopmentTabProps {
  staffPhone?: string
  organizationId?: string | null
  assignedCourses?: AssignedDevelopmentCourse[]
  notes?: string
  onNotesChange?: (notes: string) => void
  onAssignCourse?: () => void
  hasCitHistory?: boolean
  nominatedDate?: string
  nominatedBy?: string
  citCourseStatuses?: DevelopmentCourseStatus[]
  citOjtEventsCompleted?: number
  citOjtEvents?: CitOjtEvent[]
  citQuestionnaireSubmittedAt?: string | null
  citGraduationDate?: string | null
}

type DevelopmentTerminology = ProductTerminology & {
  courses?: string
  developmentNotes?: string
  citStage1?: string
  citStage2?: string
  citStage3?: string
  citStage4?: string
  citStage5?: string
}

type DevelopmentFeatures = ProductFeatures & {
  citProgram?: boolean
}

type DevelopmentProductConfig = ProductConfig & {
  cit?: {
    courseNames?: string[]
  }
}

function formatDisplayDate(
  value: string | null | undefined,
  timezone: string,
): string | null {
  if (!value?.trim()) {
    return null
  }

  return formatInOrgTz(value, DATE_DISPLAY_FORMAT, timezone)
}

function CourseStatusBadge({ status }: { status: DevelopmentCourseStatus }) {
  const styles: Record<
    DevelopmentCourseStatus,
    { backgroundColor: string; color: string }
  > = {
    'Not Started': { backgroundColor: '#6B7280', color: '#ffffff' },
    'In Progress': { backgroundColor: '#F59E0B', color: '#ffffff' },
    Passed: { backgroundColor: '#22C55E', color: '#ffffff' },
    Failed: { backgroundColor: '#EF4444', color: '#ffffff' },
  }

  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 600,
        borderRadius: '4px',
        padding: '2px 8px',
        whiteSpace: 'nowrap',
        ...styles[status],
      }}
    >
      {status}
    </span>
  )
}

function StageCircle({
  state,
}: {
  state: 'completed' | 'active' | 'future'
}) {
  if (state === 'completed') {
    return (
      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          backgroundColor: '#22C55E',
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        ✓
      </div>
    )
  }

  if (state === 'active') {
    return (
      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          backgroundColor: '#1B3A5C',
          flexShrink: 0,
        }}
      />
    )
  }

  return (
    <div
      style={{
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        border: '2px solid #D1D5DB',
        backgroundColor: 'transparent',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    />
  )
}

export default function StaffProfileDevelopmentTab({
  staffPhone: _staffPhone,
  organizationId: _organizationId,
  assignedCourses = [],
  notes = '',
  onNotesChange = () => {},
  onAssignCourse = () => {},
  hasCitHistory = false,
  nominatedDate = '',
  nominatedBy = '',
  citCourseStatuses = [],
  citOjtEventsCompleted = 0,
  citOjtEvents = [],
  citQuestionnaireSubmittedAt = null,
  citGraduationDate = null,
}: StaffProfileDevelopmentTabProps) {
  const productConfig = useProductConfig() as DevelopmentProductConfig
  const { colors } = productConfig
  const terminology = productConfig.terminology as DevelopmentTerminology
  const features = productConfig.features as DevelopmentFeatures
  const { timezone } = useOrgTimezone()
  const [draftNotes, setDraftNotes] = useState(notes)

  useEffect(() => {
    setDraftNotes(notes)
  }, [notes])

  const outlineButtonStyle = useMemo(
    () => ({
      fontSize: '12px',
      fontWeight: 500,
      borderRadius: '6px',
      padding: '6px 12px',
      border: `1px solid ${colors.brand_navy}`,
      backgroundColor: 'transparent',
      color: colors.brand_navy,
      cursor: 'pointer',
      whiteSpace: 'nowrap' as const,
    }),
    [colors.brand_navy],
  )

  const cardStyle = useMemo(
    () => ({
      backgroundColor: colors.white,
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
      padding: '16px',
      marginBottom: '12px',
    }),
    [colors.white],
  )

  const handleNotesBlur = useCallback(() => {
    onNotesChange(draftNotes)
  }, [draftNotes, onNotesChange])

  const citCourseNames =
    productConfig.cit?.courseNames ?? [...DEFAULT_CIT_COURSE_NAMES]

  const resolvedCitCourseStatuses = useMemo(() => {
    return citCourseNames.map(
      (_, index) => citCourseStatuses[index] ?? 'Not Started',
    ) as DevelopmentCourseStatus[]
  }, [citCourseNames, citCourseStatuses])

  const stage1Complete = Boolean(nominatedDate?.trim())
  const stage2Complete =
    resolvedCitCourseStatuses.length >= 3 &&
    resolvedCitCourseStatuses.every((status) => status === 'Passed')
  const stage3Complete = citOjtEventsCompleted >= 5
  const stage4Complete = Boolean(citQuestionnaireSubmittedAt?.trim())
  const stage5Complete = Boolean(citGraduationDate?.trim())

  const stageCompletions = [
    stage1Complete,
    stage2Complete,
    stage3Complete,
    stage4Complete,
    stage5Complete,
  ]

  const activeStageIndex = stageCompletions.findIndex((complete) => !complete)

  const showCitProgram =
    features.citProgram === true && hasCitHistory

  const getStageCircleState = (
    stageIndex: number,
  ): 'completed' | 'active' | 'future' => {
    if (stageCompletions[stageIndex]) {
      return 'completed'
    }
    if (stageIndex === activeStageIndex) {
      return 'active'
    }
    return 'future'
  }

  const stageLabels = [
    terminology.citStage1 ?? 'Nominated',
    terminology.citStage2 ?? 'Coursework',
    terminology.citStage3 ?? 'On the Job Training',
    terminology.citStage4 ?? 'Final Questionnaire',
    terminology.citStage5 ?? 'Graduated',
  ]

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      style={{ padding: '16px' }}
    >
      <section style={{ marginBottom: '24px' }}>
        <div
          className="mb-3 flex items-center justify-between gap-2"
        >
          <h3
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: colors.brand_navy,
              margin: 0,
            }}
          >
            {terminology.courses ?? 'Courses'}
          </h3>
          <button type="button" onClick={onAssignCourse} style={outlineButtonStyle}>
            Assign Course
          </button>
        </div>

        {assignedCourses.length === 0 ? (
          <p
            style={{
              fontSize: '13px',
              fontStyle: 'italic',
              color: colors.text_muted,
              textAlign: 'center',
              margin: 0,
            }}
          >
            No courses assigned yet.
          </p>
        ) : (
          <div>
            {assignedCourses.map((course) => {
              const assignedDateLabel = formatDisplayDate(
                course.assignedDate,
                timezone,
              )
              const passDateLabel = formatDisplayDate(course.passDate, timezone)

              return (
                <div key={course.id} style={cardStyle}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: colors.brand_navy,
                          margin: 0,
                        }}
                      >
                        {course.courseName}
                      </p>
                      {assignedDateLabel ? (
                        <p
                          style={{
                            fontSize: '12px',
                            color: colors.text_muted,
                            marginTop: '6px',
                            marginBottom: 0,
                          }}
                        >
                          Assigned {assignedDateLabel}
                        </p>
                      ) : null}
                      {course.status === 'Passed' && passDateLabel ? (
                        <p
                          style={{
                            fontSize: '12px',
                            color: colors.text_muted,
                            marginTop: '4px',
                            marginBottom: 0,
                          }}
                        >
                          Passed {passDateLabel}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end" style={{ gap: '6px' }}>
                      <CourseStatusBadge status={course.status} />
                      {course.status === 'Failed' ? (
                        <button
                          type="button"
                          className="border-none bg-transparent p-0"
                          style={{
                            fontSize: '12px',
                            color: colors.brand_navy,
                            textDecoration: 'underline',
                            cursor: 'pointer',
                          }}
                        >
                          Retake
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section style={{ marginBottom: '24px' }}>
        <h3
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: colors.brand_navy,
            margin: '0 0 12px',
          }}
        >
          {terminology.developmentNotes ?? 'Development Notes'}
        </h3>
        <textarea
          value={draftNotes}
          onChange={(event) => setDraftNotes(event.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Private coordinator notes on this staff member's development..."
          className="w-full resize-y outline-none"
          style={{
            minHeight: '100px',
            backgroundColor: colors.white,
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '13px',
            color: colors.text_body,
            boxSizing: 'border-box',
          }}
        />
      </section>

      {showCitProgram ? (
        <section>
          <h3
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: colors.brand_navy,
              margin: '0 0 16px',
            }}
          >
            CIT Program
          </h3>

          <div className="flex flex-col">
            {stageLabels.map((label, stageIndex) => {
              const isLastStage = stageIndex === stageLabels.length - 1
              const circleState = getStageCircleState(stageIndex)
              const isActiveStage = stageIndex === activeStageIndex
              const nominatedDateLabel = formatDisplayDate(nominatedDate, timezone)
              const questionnaireDateLabel = formatDisplayDate(
                citQuestionnaireSubmittedAt,
                timezone,
              )
              const graduationDateLabel = formatDisplayDate(
                citGraduationDate,
                timezone,
              )

              return (
                <div key={label} className="flex gap-3">
                  <div
                    className="flex flex-col items-center"
                    style={{ width: '20px' }}
                  >
                    <StageCircle state={circleState} />
                    {!isLastStage ? (
                      <div
                        style={{
                          width: '2px',
                          flex: 1,
                          minHeight: '24px',
                          backgroundColor: '#D1D5DB',
                          marginTop: '4px',
                          marginBottom: '4px',
                        }}
                      />
                    ) : null}
                  </div>

                  <div
                    className="min-w-0 flex-1"
                    style={{
                      paddingBottom: isLastStage ? 0 : '20px',
                      borderLeft: isActiveStage
                        ? `3px solid ${colors.brand_navy}`
                        : '3px solid transparent',
                      paddingLeft: '12px',
                      marginLeft: '-3px',
                    }}
                  >
                    <p
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: colors.brand_navy,
                        margin: '0 0 8px',
                      }}
                    >
                      {label}
                    </p>

                    {stageIndex === 0 ? (
                      <div>
                        {nominatedDateLabel ? (
                          <p
                            style={{
                              fontSize: '12px',
                              color: colors.text_muted,
                              margin: '0 0 4px',
                            }}
                          >
                            {nominatedDateLabel}
                          </p>
                        ) : null}
                        {nominatedBy?.trim() ? (
                          <p
                            style={{
                              fontSize: '12px',
                              color: colors.text_muted,
                              margin: 0,
                            }}
                          >
                            {nominatedBy}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {stageIndex === 1 ? (
                      <div className="flex flex-col" style={{ gap: '8px' }}>
                        {citCourseNames.map((courseName, courseIndex) => (
                          <div
                            key={courseName}
                            className="flex items-center justify-between gap-2"
                          >
                            <span
                              style={{
                                fontSize: '13px',
                                color: colors.text_muted,
                              }}
                            >
                              {courseName}
                            </span>
                            <CourseStatusBadge
                              status={
                                resolvedCitCourseStatuses[courseIndex] ??
                                'Not Started'
                              }
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {stageIndex === 2 ? (
                      <div>
                        <p
                          style={{
                            fontSize: '13px',
                            color: colors.text_body,
                            margin: '0 0 8px',
                          }}
                        >
                          {citOjtEventsCompleted} of 5 events completed as CIT
                        </p>
                        {citOjtEvents.map((event) => {
                          const eventDateLabel = formatDisplayDate(
                            event.eventDate,
                            timezone,
                          )

                          return (
                            <p
                              key={`${event.eventName}-${event.eventDate}`}
                              style={{
                                fontSize: '12px',
                                color: colors.text_muted,
                                margin: '0 0 4px',
                              }}
                            >
                              {event.eventName}
                              {eventDateLabel ? ` · ${eventDateLabel}` : ''}
                            </p>
                          )
                        })}
                      </div>
                    ) : null}

                    {stageIndex === 3 ? (
                      <p
                        style={{
                          fontSize: '13px',
                          color: colors.text_body,
                          margin: 0,
                        }}
                      >
                        {questionnaireDateLabel
                          ? `Submitted on ${questionnaireDateLabel}`
                          : 'Not Started'}
                      </p>
                    ) : null}

                    {stageIndex === 4 ? (
                      graduationDateLabel ? (
                        <p
                          style={{
                            fontSize: '12px',
                            color: colors.text_muted,
                            margin: 0,
                          }}
                        >
                          {graduationDateLabel}
                        </p>
                      ) : (
                        <p
                          style={{
                            fontSize: '13px',
                            fontStyle: 'italic',
                            color: colors.text_muted,
                            margin: 0,
                          }}
                        >
                          In Progress
                        </p>
                      )
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}
    </div>
  )
}
