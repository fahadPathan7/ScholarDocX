import uuid
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass


class AppSettings(Base):
    __tablename__ = 'app_settings'

    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    key: Mapped[Optional[str]] = mapped_column(Text, primary_key=True)


class PolarProcessedEvents(Base):
    """Idempotency log for Polar webhooks (SCHOLARDOCX-0157).

    Polar retries undelivered webhooks; without a processed-event guard a single
    order.created / subscription.updated event would grant credits or mutate plan
    state N times. The `event_id` is the svix message id (`svix-id` header) when
    present, falling back to the Polar object id (`data.id`). The unique
    constraint makes the insert the dedup point: a second insert for the same
    event_id raises, which the webhook handler treats as "already processed".
    """
    __tablename__ = 'polar_processed_events'
    __table_args__ = (
        UniqueConstraint('event_id'),
        Index('idx_polar_processed_events_event_id', 'event_id'),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    event_id: Mapped[str] = mapped_column(Text, nullable=False)
    event_type: Mapped[Optional[str]] = mapped_column(Text)
    processed_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class InviteCodes(Base):
    __tablename__ = 'invite_codes'
    __table_args__ = (
        Index('idx_invite_codes_code', 'code'),
        Index('idx_invite_codes_created_by', 'created_by'),
        Index('idx_invite_codes_expires_at', 'expires_at')
    )

    code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    max_uses: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    used_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    expires_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))

    users: Mapped['Users'] = relationship('Users', foreign_keys=[created_by], back_populates='invite_codes_created_by')
    users_registered_with_invite: Mapped[list['Users']] = relationship('Users', foreign_keys='[Users.registered_with_invite_id]', back_populates='registered_with_invite')


class RoleLimits(Base):
    __tablename__ = 'role_limits'
    __table_args__ = (
        UniqueConstraint('role', 'feature'),
        Index('idx_role_limits_feature', 'feature'),
        Index('idx_role_limits_role', 'role')
    )

    role: Mapped[str] = mapped_column(Text, nullable=False)
    feature: Mapped[str] = mapped_column(Text, nullable=False)
    limit_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('-1'))
    reset_period: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'never'"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))


class SuspensionAppeals(Base):
    __tablename__ = 'suspension_appeals'

    email: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'Pending'"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    ip_address: Mapped[Optional[str]] = mapped_column(Text)


class PasswordResetRequests(Base):
    __tablename__ = 'password_reset_requests'

    email: Mapped[str] = mapped_column(Text, nullable=False)
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'Pending'"))
    ip_address: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    reviewed_by: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    reviewed_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))


class Users(Base):
    __tablename__ = 'users'
    __table_args__ = (
        Index('idx_users_email', 'email'),
        Index('idx_users_is_active', 'is_active'),
        Index('idx_users_token_version', 'token_version'),
        Index('idx_users_created_at', 'created_at')
    )

    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'User'"))
    roles: Mapped[str] = mapped_column(Text, nullable=False, server_default=text('\'["general_user"]\''))
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    is_blocked: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    avatar: Mapped[Optional[str]] = mapped_column(Text)
    last_login_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    plan_started_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    plan_ends_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    registered_with_invite_id: Mapped[Optional[str]] = mapped_column(ForeignKey('invite_codes.id'))
    polar_customer_id: Mapped[Optional[str]] = mapped_column(Text)
    polar_subscription_id: Mapped[Optional[str]] = mapped_column(Text)
    plan_renews_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    polar_cancel_at_period_end: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    invite_codes_created_by: Mapped[list['InviteCodes']] = relationship('InviteCodes', foreign_keys='[InviteCodes.created_by]', back_populates='users')
    registered_with_invite: Mapped[Optional['InviteCodes']] = relationship('InviteCodes', foreign_keys=[registered_with_invite_id], back_populates='users_registered_with_invite')
    ai_conversations: Mapped[list['AiConversations']] = relationship('AiConversations', back_populates='user')
    audit_logs: Mapped[list['AuditLogs']] = relationship('AuditLogs', back_populates='user')
    bookmarked_news: Mapped[list['BookmarkedNews']] = relationship('BookmarkedNews', back_populates='user')
    degree_workspaces: Mapped[list['DegreeWorkspaces']] = relationship('DegreeWorkspaces', back_populates='user')
    document_categories: Mapped[list['DocumentCategories']] = relationship('DocumentCategories', back_populates='user')
    documents: Mapped[list['Documents']] = relationship('Documents', back_populates='user')
    email_templates: Mapped[list['EmailTemplates']] = relationship('EmailTemplates', back_populates='user')
    invite_requests: Mapped[list['InviteRequests']] = relationship('InviteRequests', back_populates='user')
    local_profiles: Mapped[list['LocalProfiles']] = relationship('LocalProfiles', back_populates='user')
    plan_upgrade_requests_reviewed_by: Mapped[list['PlanUpgradeRequests']] = relationship('PlanUpgradeRequests', foreign_keys='[PlanUpgradeRequests.reviewed_by]', back_populates='users')
    plan_upgrade_requests_user: Mapped[list['PlanUpgradeRequests']] = relationship('PlanUpgradeRequests', foreign_keys='[PlanUpgradeRequests.user_id]', back_populates='user')
    projects: Mapped[list['Projects']] = relationship('Projects', back_populates='user')
    scholarship_search_feedback: Mapped[list['ScholarshipSearchFeedback']] = relationship('ScholarshipSearchFeedback', back_populates='user')
    sticky_notes: Mapped[list['StickyNotes']] = relationship('StickyNotes', back_populates='user')
    universities: Mapped[list['Universities']] = relationship('Universities', back_populates='user')
    user_sessions: Mapped[list['UserSessions']] = relationship('UserSessions', back_populates='user')
    user_usage_stats: Mapped[list['UserUsageStats']] = relationship('UserUsageStats', back_populates='user')
    whiteboards: Mapped[list['Whiteboards']] = relationship('Whiteboards', back_populates='user')
    notifications: Mapped[list['Notifications']] = relationship('Notifications', back_populates='user')
    programs: Mapped[list['Programs']] = relationship('Programs', back_populates='user')
    project_sheets: Mapped[list['ProjectSheets']] = relationship('ProjectSheets', back_populates='user')
    professors: Mapped[list['Professors']] = relationship('Professors', back_populates='user')
    project_pages: Mapped[list['ProjectPages']] = relationship('ProjectPages', back_populates='user')
    applications: Mapped[list['Applications']] = relationship('Applications', back_populates='user')
    deadlines: Mapped[list['Deadlines']] = relationship('Deadlines', back_populates='user')
    document_versions: Mapped[list['DocumentVersions']] = relationship('DocumentVersions', back_populates='user')
    email_drafts: Mapped[list['EmailDrafts']] = relationship('EmailDrafts', back_populates='user')
    research_notes: Mapped[list['ResearchNotes']] = relationship('ResearchNotes', back_populates='user')
    static_files: Mapped[list['StaticFiles']] = relationship('StaticFiles', back_populates='user')
    outreach_logs: Mapped[list['OutreachLogs']] = relationship('OutreachLogs', back_populates='user')
    reminders: Mapped[list['Reminders']] = relationship('Reminders', back_populates='user')
    saved_scholarship_queries: Mapped[list['SavedScholarshipQueries']] = relationship('SavedScholarshipQueries', back_populates='user')
    scholarship_opportunities: Mapped[list['ScholarshipOpportunities']] = relationship('ScholarshipOpportunities', back_populates='user')


class AiConversations(Base):
    __tablename__ = 'ai_conversations'

    title: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='ai_conversations')


class AuditLogs(Base):
    __tablename__ = 'audit_logs'
    __table_args__ = (
        Index('idx_audit_logs_action', 'action'),
        Index('idx_audit_logs_created_at', 'created_at'),
        Index('idx_audit_logs_target_id', 'target_id'),
        Index('idx_audit_logs_target_type', 'target_type'),
        Index('idx_audit_logs_user_id', 'user_id')
    )

    action: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    target_type: Mapped[Optional[str]] = mapped_column(Text)
    target_id: Mapped[Optional[str]] = mapped_column(Text)
    details: Mapped[Optional[str]] = mapped_column(Text)
    ip_address: Mapped[Optional[str]] = mapped_column(Text)

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='audit_logs')


class BookmarkedNews(Base):
    __tablename__ = 'bookmarked_news'
    __table_args__ = (
        UniqueConstraint('user_id', 'article_id'),
    )

    article_id: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    source_name: Mapped[Optional[str]] = mapped_column(Text)
    pub_date: Mapped[Optional[str]] = mapped_column(Text)
    image_url: Mapped[Optional[str]] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)
    country: Mapped[Optional[str]] = mapped_column(Text)

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='bookmarked_news')


class DegreeWorkspaces(Base):
    __tablename__ = 'degree_workspaces'

    degree_type: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='degree_workspaces')
    applications: Mapped[list['Applications']] = relationship('Applications', back_populates='degree_workspace')


class DocumentCategories(Base):
    __tablename__ = 'document_categories'
    __table_args__ = (
        UniqueConstraint('user_id', 'slug'),
    )

    slug: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    polar_product_id: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='document_categories')


class Documents(Base):
    __tablename__ = 'documents'

    document_type: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    owner_scope: Mapped[Optional[str]] = mapped_column(Text, server_default=text("'general'"))
    owner_id: Mapped[Optional[str]] = mapped_column(String(36))

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='documents')
    document_versions: Mapped[list['DocumentVersions']] = relationship('DocumentVersions', back_populates='document', cascade="all")


class EmailTemplates(Base):
    __tablename__ = 'email_templates'

    name: Mapped[str] = mapped_column(Text, nullable=False)
    subject_template: Mapped[str] = mapped_column(Text, nullable=False)
    body_template: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='email_templates')
    email_drafts: Mapped[list['EmailDrafts']] = relationship('EmailDrafts', back_populates='template')


class InviteRequests(Base):
    __tablename__ = 'invite_requests'

    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'Pending'"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    phone: Mapped[Optional[str]] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)
    ip_address: Mapped[Optional[str]] = mapped_column(Text)

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='invite_requests')


class LocalProfiles(Base):
    __tablename__ = 'local_profiles'
    __table_args__ = (
        Index('idx_local_profiles_user_id', 'user_id'),
    )

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    display_name: Mapped[Optional[str]] = mapped_column(Text)
    email: Mapped[Optional[str]] = mapped_column(Text)
    preferred_email_provider: Mapped[Optional[str]] = mapped_column(Text)
    timezone: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    avatar: Mapped[Optional[str]] = mapped_column(Text)
    notification_settings: Mapped[Optional[str]] = mapped_column(Text, server_default=text('\'{"project_create": true, "project_delete": true, "project_pin": false, "sheet_create": true, "sheet_delete": true, "sheet_pin": false, "record_create": false, "record_delete": true, "whiteboard_create": false, "whiteboard_delete": true, "sticky_note_create": false, "sticky_note_update": false, "sticky_note_delete": true, "scheduled_email": true, "system": true, "announcements": true, "billing": true, "plans": true}\''))
    hunt_profile_json: Mapped[Optional[str]] = mapped_column(Text, server_default=text("'{}'"))

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='local_profiles')


class PlanUpgradeRequests(Base):
    __tablename__ = 'plan_upgrade_requests'

    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False)
    request_type: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'upgrade'"))
    requested_plan: Mapped[str] = mapped_column(Text, nullable=False)
    billing_cycle: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'monthly'"))
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'Pending'"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    message: Mapped[Optional[str]] = mapped_column(Text)
    reviewed_by: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    reviewed_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))

    users: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[reviewed_by], back_populates='plan_upgrade_requests_reviewed_by')
    user: Mapped['Users'] = relationship('Users', foreign_keys=[user_id], back_populates='plan_upgrade_requests_user')


class Projects(Base):
    __tablename__ = 'projects'

    name: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'Active'"))
    is_pinned: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    pinned_to_dashboard: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    degree_type: Mapped[Optional[str]] = mapped_column(Text)
    intake_term: Mapped[Optional[str]] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='projects')
    notifications: Mapped[list['Notifications']] = relationship('Notifications', back_populates='project')
    project_sheets: Mapped[list['ProjectSheets']] = relationship('ProjectSheets', back_populates='project', cascade="all")
    project_pages: Mapped[list['ProjectPages']] = relationship('ProjectPages', back_populates='project', cascade="all")


class ScholarshipSearchFeedback(Base):
    __tablename__ = 'scholarship_search_feedback'
    __table_args__ = (
        Index('idx_scholarship_search_feedback_created_at', 'created_at'),
        Index('idx_scholarship_search_feedback_user_id', 'user_id')
    )

    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False)
    initial_query: Mapped[str] = mapped_column(Text, nullable=False)
    refined_query: Mapped[str] = mapped_column(Text, nullable=False)
    filters_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    was_edited: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    provider_status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'pending'"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    result_count: Mapped[Optional[int]] = mapped_column(Integer)

    user: Mapped['Users'] = relationship('Users', back_populates='scholarship_search_feedback')


class StickyNotes(Base):
    __tablename__ = 'sticky_notes'

    title: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    color: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'sun'"))
    is_checklist: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    checklist_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    font: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'caveat'"))
    font_size: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'medium'"))
    is_pinned: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    body: Mapped[Optional[str]] = mapped_column(Text)

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='sticky_notes')


class Universities(Base):
    __tablename__ = 'universities'

    name: Mapped[str] = mapped_column(Text, nullable=False)
    country: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    region: Mapped[Optional[str]] = mapped_column(Text)
    website_url: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='universities')
    programs: Mapped[list['Programs']] = relationship('Programs', back_populates='university', cascade="all")
    professors: Mapped[list['Professors']] = relationship('Professors', back_populates='university')
    applications: Mapped[list['Applications']] = relationship('Applications', back_populates='university')
    research_notes: Mapped[list['ResearchNotes']] = relationship('ResearchNotes', back_populates='university')


class UserSessions(Base):
    __tablename__ = 'user_sessions'
    __table_args__ = (
        Index('idx_user_sessions_expires_at', 'expires_at'),
        Index('idx_user_sessions_revoked_at', 'revoked_at'),
        Index('idx_user_sessions_token_jti', 'token_jti'),
        Index('idx_user_sessions_user_id', 'user_id')
    )

    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False)
    token_jti: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    expires_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    ip_address: Mapped[Optional[str]] = mapped_column(Text)
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    revoked_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))

    user: Mapped['Users'] = relationship('Users', back_populates='user_sessions')


class UserUsageStats(Base):
    __tablename__ = 'user_usage_stats'
    __table_args__ = (
        UniqueConstraint('user_id', 'feature'),
        Index('idx_user_usage_stats_feature', 'feature'),
        Index('idx_user_usage_stats_user_id', 'user_id')
    )

    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False)
    feature: Mapped[str] = mapped_column(Text, nullable=False)
    current_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    last_reset_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))

    user: Mapped['Users'] = relationship('Users', back_populates='user_usage_stats')


class Whiteboards(Base):
    __tablename__ = 'whiteboards'

    name: Mapped[str] = mapped_column(Text, nullable=False)
    shapes_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    camera_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text('\'{"x":0,"y":0,"zoom":1}\''))
    last_used_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='whiteboards')


class Notifications(Base):
    __tablename__ = 'notifications'

    title: Mapped[str] = mapped_column(Text, nullable=False)
    notification_type: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'general'"))
    preference_key: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'system'"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    project_id: Mapped[Optional[str]] = mapped_column(ForeignKey('projects.id'))
    body: Mapped[Optional[str]] = mapped_column(Text)
    due_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))

    project: Mapped[Optional['Projects']] = relationship('Projects', back_populates='notifications')
    user: Mapped[Optional['Users']] = relationship('Users', back_populates='notifications')


class Programs(Base):
    __tablename__ = 'programs'

    university_id: Mapped[str] = mapped_column(ForeignKey('universities.id'), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    degree_type: Mapped[Optional[str]] = mapped_column(Text)
    department: Mapped[Optional[str]] = mapped_column(Text)
    application_url: Mapped[Optional[str]] = mapped_column(Text)
    funding_url: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    university: Mapped['Universities'] = relationship('Universities', back_populates='programs')
    user: Mapped[Optional['Users']] = relationship('Users', back_populates='programs')
    professors: Mapped[list['Professors']] = relationship('Professors', back_populates='program')
    applications: Mapped[list['Applications']] = relationship('Applications', back_populates='program')


class ProjectSheets(Base):
    __tablename__ = 'project_sheets'

    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    is_pinned: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    pinned_to_dashboard: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))

    project: Mapped['Projects'] = relationship('Projects', back_populates='project_sheets')
    user: Mapped[Optional['Users']] = relationship('Users', back_populates='project_sheets')
    project_pages: Mapped[list['ProjectPages']] = relationship('ProjectPages', back_populates='sheet')


class Professors(Base):
    __tablename__ = 'professors'

    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    university_id: Mapped[Optional[str]] = mapped_column(ForeignKey('universities.id'))
    program_id: Mapped[Optional[str]] = mapped_column(ForeignKey('programs.id'))
    title: Mapped[Optional[str]] = mapped_column(Text)
    email: Mapped[Optional[str]] = mapped_column(Text)
    profile_url: Mapped[Optional[str]] = mapped_column(Text)
    research_interests: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    program: Mapped[Optional['Programs']] = relationship('Programs', back_populates='professors')
    university: Mapped[Optional['Universities']] = relationship('Universities', back_populates='professors')
    user: Mapped[Optional['Users']] = relationship('Users', back_populates='professors')
    applications: Mapped[list['Applications']] = relationship('Applications', back_populates='professor')
    email_drafts: Mapped[list['EmailDrafts']] = relationship('EmailDrafts', back_populates='professor')
    research_notes: Mapped[list['ResearchNotes']] = relationship('ResearchNotes', back_populates='professor')
    outreach_logs: Mapped[list['OutreachLogs']] = relationship('OutreachLogs', back_populates='professor')


class ProjectPages(Base):
    __tablename__ = 'project_pages'

    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    columns_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    rows_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    sheet_id: Mapped[Optional[str]] = mapped_column(ForeignKey('project_sheets.id'))
    email_config_json: Mapped[Optional[str]] = mapped_column(Text)

    project: Mapped['Projects'] = relationship('Projects', back_populates='project_pages')
    sheet: Mapped[Optional['ProjectSheets']] = relationship('ProjectSheets', back_populates='project_pages')
    user: Mapped[Optional['Users']] = relationship('Users', back_populates='project_pages')


class Applications(Base):
    __tablename__ = 'applications'

    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'Researching'"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    degree_workspace_id: Mapped[Optional[str]] = mapped_column(ForeignKey('degree_workspaces.id'))
    university_id: Mapped[Optional[str]] = mapped_column(ForeignKey('universities.id'))
    program_id: Mapped[Optional[str]] = mapped_column(ForeignKey('programs.id'))
    professor_id: Mapped[Optional[str]] = mapped_column(ForeignKey('professors.id'))
    intake_term: Mapped[Optional[str]] = mapped_column(Text)
    application_url: Mapped[Optional[str]] = mapped_column(Text)
    priority: Mapped[Optional[str]] = mapped_column(Text, server_default=text("'Medium'"))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    degree_workspace: Mapped[Optional['DegreeWorkspaces']] = relationship('DegreeWorkspaces', back_populates='applications')
    professor: Mapped[Optional['Professors']] = relationship('Professors', back_populates='applications')
    program: Mapped[Optional['Programs']] = relationship('Programs', back_populates='applications')
    university: Mapped[Optional['Universities']] = relationship('Universities', back_populates='applications')
    user: Mapped[Optional['Users']] = relationship('Users', back_populates='applications')
    deadlines: Mapped[list['Deadlines']] = relationship('Deadlines', back_populates='application')
    document_versions: Mapped[list['DocumentVersions']] = relationship('DocumentVersions', back_populates='application')
    email_drafts: Mapped[list['EmailDrafts']] = relationship('EmailDrafts', back_populates='application')
    research_notes: Mapped[list['ResearchNotes']] = relationship('ResearchNotes', back_populates='application')
    static_files: Mapped[list['StaticFiles']] = relationship('StaticFiles', back_populates='application')
    outreach_logs: Mapped[list['OutreachLogs']] = relationship('OutreachLogs', back_populates='application')
    reminders: Mapped[list['Reminders']] = relationship('Reminders', back_populates='application')


class Deadlines(Base):
    __tablename__ = 'deadlines'

    deadline_type: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    due_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    application_id: Mapped[Optional[str]] = mapped_column(ForeignKey('applications.id'))
    completed_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    application: Mapped[Optional['Applications']] = relationship('Applications', back_populates='deadlines')
    user: Mapped[Optional['Users']] = relationship('Users', back_populates='deadlines')


class DocumentVersions(Base):
    __tablename__ = 'document_versions'

    document_id: Mapped[str] = mapped_column(ForeignKey('documents.id'), nullable=False)
    version_label: Mapped[str] = mapped_column(Text, nullable=False)
    content_format: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'markdown'"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    application_id: Mapped[Optional[str]] = mapped_column(ForeignKey('applications.id'))

    application: Mapped[Optional['Applications']] = relationship('Applications', back_populates='document_versions')
    document: Mapped['Documents'] = relationship('Documents', back_populates='document_versions')
    user: Mapped[Optional['Users']] = relationship('Users', back_populates='document_versions')


class EmailDrafts(Base):
    __tablename__ = 'email_drafts'

    subject: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'Draft'"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    template_id: Mapped[Optional[str]] = mapped_column(ForeignKey('email_templates.id'))
    application_id: Mapped[Optional[str]] = mapped_column(ForeignKey('applications.id'))
    professor_id: Mapped[Optional[str]] = mapped_column(ForeignKey('professors.id'))
    recipient_email: Mapped[Optional[str]] = mapped_column(Text)

    application: Mapped[Optional['Applications']] = relationship('Applications', back_populates='email_drafts')
    professor: Mapped[Optional['Professors']] = relationship('Professors', back_populates='email_drafts')
    template: Mapped[Optional['EmailTemplates']] = relationship('EmailTemplates', back_populates='email_drafts')
    user: Mapped[Optional['Users']] = relationship('Users', back_populates='email_drafts')
    outreach_logs: Mapped[list['OutreachLogs']] = relationship('OutreachLogs', back_populates='email_draft')


class ResearchNotes(Base):
    __tablename__ = 'research_notes'

    title: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    application_id: Mapped[Optional[str]] = mapped_column(ForeignKey('applications.id'))
    professor_id: Mapped[Optional[str]] = mapped_column(ForeignKey('professors.id'))
    university_id: Mapped[Optional[str]] = mapped_column(ForeignKey('universities.id'))
    sources: Mapped[Optional[str]] = mapped_column(Text)

    application: Mapped[Optional['Applications']] = relationship('Applications', back_populates='research_notes')
    professor: Mapped[Optional['Professors']] = relationship('Professors', back_populates='research_notes')
    university: Mapped[Optional['Universities']] = relationship('Universities', back_populates='research_notes')
    user: Mapped[Optional['Users']] = relationship('Users', back_populates='research_notes')


class StaticFiles(Base):
    __tablename__ = 'static_files'

    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str] = mapped_column(Text, nullable=False)
    relative_path: Mapped[str] = mapped_column(Text, nullable=False)
    is_pinned: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    pinned_to_dashboard: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    mime_type: Mapped[Optional[str]] = mapped_column(Text)
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, server_default=text('0'))
    application_id: Mapped[Optional[str]] = mapped_column(ForeignKey('applications.id'))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    application: Mapped[Optional['Applications']] = relationship('Applications', back_populates='static_files')
    user: Mapped[Optional['Users']] = relationship('Users', back_populates='static_files')


class OutreachLogs(Base):
    __tablename__ = 'outreach_logs'

    recipient_email: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    sent_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    email_draft_id: Mapped[Optional[str]] = mapped_column(ForeignKey('email_drafts.id'))
    application_id: Mapped[Optional[str]] = mapped_column(ForeignKey('applications.id'))
    professor_id: Mapped[Optional[str]] = mapped_column(ForeignKey('professors.id'))
    response_status: Mapped[Optional[str]] = mapped_column(Text, server_default=text("'Waiting'"))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    application: Mapped[Optional['Applications']] = relationship('Applications', back_populates='outreach_logs')
    email_draft: Mapped[Optional['EmailDrafts']] = relationship('EmailDrafts', back_populates='outreach_logs')
    professor: Mapped[Optional['Professors']] = relationship('Professors', back_populates='outreach_logs')
    user: Mapped[Optional['Users']] = relationship('Users', back_populates='outreach_logs')
    reminders: Mapped[list['Reminders']] = relationship('Reminders', back_populates='outreach_log')


class Reminders(Base):
    __tablename__ = 'reminders'

    title: Mapped[str] = mapped_column(Text, nullable=False)
    due_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    application_id: Mapped[Optional[str]] = mapped_column(ForeignKey('applications.id'))
    outreach_log_id: Mapped[Optional[str]] = mapped_column(ForeignKey('outreach_logs.id'))
    completed_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    application: Mapped[Optional['Applications']] = relationship('Applications', back_populates='reminders')
    outreach_log: Mapped[Optional['OutreachLogs']] = relationship('OutreachLogs', back_populates='reminders')
    user: Mapped[Optional['Users']] = relationship('Users', back_populates='reminders')


class AdvisorAtlasRuns(Base):
    __tablename__ = "advisor_atlas_runs"
    __table_args__ = (
        Index("idx_advisor_atlas_runs_user_id", "user_id"),
        Index("idx_advisor_atlas_runs_status", "status"),
    )

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    mode: Mapped[str] = mapped_column(Text, nullable=False)
    search_depth: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'deep'"))
    university_name: Mapped[Optional[str]] = mapped_column(Text)
    university_url: Mapped[Optional[str]] = mapped_column(Text)
    department: Mapped[Optional[str]] = mapped_column(Text)
    professor_name: Mapped[Optional[str]] = mapped_column(Text)
    degree_target: Mapped[Optional[str]] = mapped_column(Text)
    intake_term: Mapped[Optional[str]] = mapped_column(Text)
    research_profile_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    approved_domains_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'queued'"))
    current_stage: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'queued'"))
    progress_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    action_center_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    started_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))


class AdvisorAtlasCandidates(Base):
    __tablename__ = "advisor_atlas_candidates"
    __table_args__ = (
        Index("idx_advisor_atlas_candidates_run_id", "run_id"),
        Index("idx_advisor_atlas_candidates_user_id", "user_id"),
    )

    run_id: Mapped[str] = mapped_column(ForeignKey("advisor_atlas_runs.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    normalized_name: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(Text)
    institution: Mapped[Optional[str]] = mapped_column(Text)
    department: Mapped[Optional[str]] = mapped_column(Text)
    email: Mapped[Optional[str]] = mapped_column(Text)
    official_profile_url: Mapped[Optional[str]] = mapped_column(Text)
    personal_url: Mapped[Optional[str]] = mapped_column(Text)
    linkedin_url: Mapped[Optional[str]] = mapped_column(Text)
    google_scholar_url: Mapped[Optional[str]] = mapped_column(Text)
    lab_name: Mapped[Optional[str]] = mapped_column(Text)
    lab_url: Mapped[Optional[str]] = mapped_column(Text)
    research_summary: Mapped[Optional[str]] = mapped_column(Text)
    match_score: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    evidence_confidence: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    recruitment_state: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'unknown'"))
    recruitment_summary: Mapped[Optional[str]] = mapped_column(Text)
    decision_lane: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'Needs Verification'"))
    intelligence_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    shortlist_status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'unreviewed'"))
    user_notes: Mapped[Optional[str]] = mapped_column(Text)
    coverage_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    risk_flags_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    saved_professor_id: Mapped[Optional[str]] = mapped_column(ForeignKey("professors.id"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))


class AdvisorAtlasEvidence(Base):
    __tablename__ = "advisor_atlas_evidence"
    __table_args__ = (
        Index("idx_advisor_atlas_evidence_candidate_id", "candidate_id"),
    )

    candidate_id: Mapped[str] = mapped_column(ForeignKey("advisor_atlas_candidates.id", ondelete="CASCADE"), nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    canonical_url: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    page_title: Mapped[Optional[str]] = mapped_column(Text)
    claim_type: Mapped[str] = mapped_column(Text, nullable=False)
    claim_text: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_excerpt: Mapped[Optional[str]] = mapped_column(Text)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("50"))
    published_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    retrieved_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))


class AdvisorAtlasPublications(Base):
    __tablename__ = "advisor_atlas_publications"
    __table_args__ = (
        Index("idx_advisor_atlas_publications_candidate_id", "candidate_id"),
    )

    candidate_id: Mapped[str] = mapped_column(ForeignKey("advisor_atlas_candidates.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    authors_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    publication_year: Mapped[Optional[int]] = mapped_column(Integer)
    venue: Mapped[Optional[str]] = mapped_column(Text)
    doi: Mapped[Optional[str]] = mapped_column(Text)
    source_url: Mapped[Optional[str]] = mapped_column(Text)
    relevance_reason: Mapped[Optional[str]] = mapped_column(Text)
    reading_priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    reading_status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'unread'"))
    user_note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))


class AdvisorAtlasDossiers(Base):
    __tablename__ = "advisor_atlas_dossiers"
    __table_args__ = (
        UniqueConstraint("candidate_id"),
    )

    candidate_id: Mapped[str] = mapped_column(ForeignKey("advisor_atlas_candidates.id", ondelete="CASCADE"), nullable=False)
    dossier_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    decision_snapshot_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    research_bridge_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    method_bridge_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    lab_environment_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    trajectory_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    application_fit_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    verification_questions_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    next_actions_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    generated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))


class AdvisorAtlasWatchEvents(Base):
    __tablename__ = "advisor_atlas_watch_events"
    __table_args__ = (
        Index("idx_advisor_atlas_watch_candidate_id", "candidate_id"),
    )

    candidate_id: Mapped[str] = mapped_column(ForeignKey("advisor_atlas_candidates.id", ondelete="CASCADE"), nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    previous_value_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'null'"))
    new_value_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'null'"))
    importance: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'medium'"))
    detected_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    acknowledged_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))


class SavedScholarshipQueries(Base):
    __tablename__ = 'saved_scholarship_queries'
    
    name: Mapped[str] = mapped_column(Text, nullable=False)
    query_string: Mapped[str] = mapped_column(Text, nullable=False)
    filters_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_used_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    seen_article_ids_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='saved_scholarship_queries')


class ScholarshipOpportunities(Base):
    __tablename__ = 'scholarship_opportunities'
    __table_args__ = (
        UniqueConstraint('user_id', 'normalized_url'),
    )

    source: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'hunt'"))
    canonical_name: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_url: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'Found'"))
    degree_levels_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    destinations_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    eligible_nationalities_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    funding_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    deadlines_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    requirements_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    field_confidence_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey('users.id'))
    sponsor: Mapped[Optional[str]] = mapped_column(Text)
    application_url: Mapped[Optional[str]] = mapped_column(Text)
    linked_sheet_id: Mapped[Optional[str]] = mapped_column(ForeignKey('project_sheets.id'))
    linked_row_snapshot: Mapped[Optional[str]] = mapped_column(Text)
    last_deadline_notified_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    deep_hunt_run_id: Mapped[Optional[str]] = mapped_column(ForeignKey('scholarship_deep_hunt_runs.id'))

    user: Mapped[Optional['Users']] = relationship('Users', back_populates='scholarship_opportunities')


class ScholarshipDeepHuntRuns(Base):
    __tablename__ = "scholarship_deep_hunt_runs"
    __table_args__ = (
        Index("idx_scholarship_deep_hunt_runs_user_id", "user_id"),
        Index("idx_scholarship_deep_hunt_runs_status", "status"),
    )

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    degree_level: Mapped[Optional[str]] = mapped_column(Text)
    destinations_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'[]'"))
    intake_term: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'queued'"))
    current_stage: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'queued'"))
    progress_json: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'{}'"))
    result_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    started_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))


class AiModels(Base):
    __tablename__ = 'ai_models'
    __table_args__ = (
        UniqueConstraint('provider', 'model_id'),
        Index('idx_ai_models_active', 'is_active'),
    )

    provider: Mapped[str] = mapped_column(Text, nullable=False)
    model_id: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    input_price_per_1m: Mapped[float] = mapped_column(Float, nullable=False, server_default=text('0'))
    output_price_per_1m: Mapped[float] = mapped_column(Float, nullable=False, server_default=text('0'))
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    polar_product_id: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))


class AiTokenBalances(Base):
    __tablename__ = 'ai_token_balances'
    __table_args__ = (
        Index('idx_ai_token_balances_period', 'subscription_period'),
    )

    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    subscription_remaining: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    subscription_period: Mapped[Optional[str]] = mapped_column(Text)
    purchased_remaining: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    purchased_total: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    last_reset_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    total_spent_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    total_spent_usd: Mapped[float] = mapped_column(Float, nullable=False, server_default=text('0'))
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AiTokenLedger(Base):
    __tablename__ = 'ai_token_ledger'
    __table_args__ = (
        Index('idx_ai_ledger_user', 'user_id'),
        Index('idx_ai_ledger_created', 'created_at'),
        Index('idx_ai_ledger_source', 'source'),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False)
    model_id: Mapped[Optional[str]] = mapped_column(Text)
    provider: Mapped[Optional[str]] = mapped_column(Text)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, server_default=text('0'))
    # Signed: negative = consumed, positive = granted (purchase/admin/monthly reset).
    tokens_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    balance_bucket: Mapped[Optional[str]] = mapped_column(Text)
    ref_id: Mapped[Optional[str]] = mapped_column(String(36))
    note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AiTokenPacks(Base):
    __tablename__ = 'ai_token_packs'

    code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    token_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    price_usd: Mapped[float] = mapped_column(Float, nullable=False, server_default=text('0'))
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    polar_product_id: Mapped[str] = mapped_column(Text, nullable=True)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))


class AiTokenPurchaseRequests(Base):
    __tablename__ = 'ai_token_purchase_requests'
    __table_args__ = (
        Index('idx_ai_tpr_user', 'user_id'),
        Index('idx_ai_tpr_status', 'status'),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), server_default=text("gen_random_uuid()"))
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), nullable=False)
    pack_id: Mapped[str] = mapped_column(ForeignKey('ai_token_packs.id'), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'Pending'"))
    requested_at: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    reviewed_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(36))
    admin_notes: Mapped[Optional[str]] = mapped_column(Text)
