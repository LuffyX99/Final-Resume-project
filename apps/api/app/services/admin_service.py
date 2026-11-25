import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    Application,
    Job,
    Match,
    Notification,
    RecruiterProfile,
    Resume,
    SupportMessage,
    SupportThread,
    User,
)
from app.schemas.admin import (
    AdminApplicationItem,
    AdminApplicationsListResponse,
    AdminCandidateUpdate,
    AdminJobItem,
    AdminJobsListResponse,
    AdminJobUpdate,
    AdminMetricsResponse,
    AdminRecruiterCreate,
    AdminRecruiterUpdate,
    AdminShortlistedItem,
    AdminShortlistedListResponse,
    AdminUserItem,
    AdminUsersListResponse,
)
from app.security import hash_password, normalize_phone
from app.services.events import event_dispatcher


class AdminService:
    @staticmethod
    async def resolve_admin_user(db: AsyncSession) -> User:
        """Return the database row that backs the environment admin identity.

        Admin login is credential-based (``ADMIN_ID`` / ``ADMIN_EMAIL`` /
        ``ADMIN_PASSWORD``), but every ownership check, support message and
        notification still needs a real ``users`` row. This helper finds that
        row, or creates it once, so admin tokens and user tokens agree on one
        identity model.
        """
        email = (settings.admin_email or "").strip().lower()

        lookup = select(User).where(User.role == "admin")
        if email:
            lookup = lookup.where(func.lower(User.email) == email)
        lookup = lookup.order_by(User.created_at.asc()).limit(1)
        admin_user = (await db.execute(lookup)).scalars().first()

        if admin_user is None and email:
            # A stale/deactivated row with the configured address still owns
            # the unique index, so reuse it rather than colliding.
            admin_user = (
                await db.execute(
                    select(User).where(func.lower(User.email) == email)
                )
            ).scalars().first()

        if admin_user is None:
            admin_user = (
                await db.execute(
                    select(User)
                    .where(User.role == "admin")
                    .order_by(User.created_at.asc())
                    .limit(1)
                )
            ).scalars().first()

        if admin_user is None:
            admin_user = User(
                role="admin",
                full_name=settings.admin_full_name,
                email=email or f"{settings.admin_id or 'admin'}@resumematch.local",
                password_hash=hash_password(settings.admin_password),
                is_active=True,
            )
            db.add(admin_user)
            await db.commit()
            await db.refresh(admin_user)
            return admin_user

        if not admin_user.is_active:
            admin_user.is_active = True
            await db.commit()
            await db.refresh(admin_user)

        return admin_user

    @staticmethod
    async def get_metrics(db: AsyncSession) -> AdminMetricsResponse:
        # Total Candidates
        res_cand = await db.execute(
            select(func.count(User.id)).where(User.role == "candidate")
        )
        total_candidates = res_cand.scalar() or 0

        # Total Recruiters
        res_rec = await db.execute(
            select(func.count(User.id)).where(User.role == "recruiter")
        )
        total_recruiters = res_rec.scalar() or 0

        # Total Jobs
        res_jobs = await db.execute(select(func.count(Job.id)))
        total_jobs = res_jobs.scalar() or 0

        # Open Jobs
        res_open_jobs = await db.execute(
            select(func.count(Job.id)).where(
                Job.status == "open",
                Job.is_taken_down.is_(False),
            )
        )
        open_jobs = res_open_jobs.scalar() or 0
        closed_jobs = total_jobs - open_jobs

        # Total Applications
        res_apps = await db.execute(select(func.count(Application.id)))
        total_applications = res_apps.scalar() or 0

        # Total Shortlisted
        res_shortlisted = await db.execute(
            select(func.count(Application.id)).where(
                Application.status == "shortlisted"
            )
        )
        total_shortlisted = res_shortlisted.scalar() or 0

        # Support tickets
        try:
            res_open_tickets = await db.execute(
                select(func.count(SupportThread.id)).where(
                    SupportThread.status == "open"
                )
            )
            open_tickets = res_open_tickets.scalar() or 0

            res_resolved_tickets = await db.execute(
                select(func.count(SupportThread.id)).where(
                    SupportThread.status == "resolved"
                )
            )
            resolved_tickets = res_resolved_tickets.scalar() or 0
        except Exception:
            open_tickets = 0
            resolved_tickets = 0

        return AdminMetricsResponse(
            total_candidates=total_candidates,
            total_recruiters=total_recruiters,
            total_jobs=total_jobs,
            open_jobs=open_jobs,
            closed_jobs=closed_jobs,
            total_applications=total_applications,
            total_shortlisted=total_shortlisted,
            open_support_tickets=open_tickets,
            resolved_support_tickets=resolved_tickets,
        )

    @staticmethod
    async def list_users(
        db: AsyncSession,
        search: str | None = None,
        role: str | None = None,
        is_active: bool | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> AdminUsersListResponse:
        query = select(User)

        if role:
            query = query.where(User.role == role)
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.where(
                or_(
                    User.full_name.ilike(term),
                    User.email.ilike(term),
                )
            )

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        res_count = await db.execute(count_query)
        total = res_count.scalar() or 0

        # Pagination
        offset = (page - 1) * page_size
        query = query.order_by(User.created_at.desc()).offset(offset).limit(page_size)
        res_users = await db.execute(query)
        users = res_users.scalars().all()

        items: list[AdminUserItem] = []
        for u in users:
            company_name = None
            industry = None
            if u.role == "recruiter":
                rec_res = await db.execute(
                    select(RecruiterProfile).where(RecruiterProfile.user_id == u.id)
                )
                prof = rec_res.scalar_one_or_none()
                if prof:
                    company_name = prof.company_name
                    industry = prof.industry

            # Activity counts
            resumes_res = await db.execute(
                select(func.count(Resume.id)).where(Resume.candidate_id == u.id)
            )
            resumes_count = resumes_res.scalar() or 0

            jobs_res = await db.execute(
                select(func.count(Job.id)).where(Job.recruiter_id == u.id)
            )
            jobs_count = jobs_res.scalar() or 0

            apps_res = await db.execute(
                select(func.count(Application.id)).where(Application.candidate_id == u.id)
            )
            apps_count = apps_res.scalar() or 0

            items.append(
                AdminUserItem(
                    id=u.id,
                    role=u.role,
                    full_name=u.full_name,
                    email=u.email,
                    phone_number=u.phone_number,
                    age=u.age,
                    gender=u.gender,
                    is_active=u.is_active,
                    created_at=u.created_at,
                    company_name=company_name,
                    industry=industry,
                    resumes_count=resumes_count,
                    jobs_count=jobs_count,
                    applications_count=apps_count,
                )
            )

        has_more = (offset + len(items)) < total

        return AdminUsersListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_more=has_more,
        )

    @staticmethod
    async def get_user_detail(db: AsyncSession, user_id: uuid.UUID) -> AdminUserItem:
        user = await db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        company_name = None
        industry = None
        if user.role == "recruiter":
            rec_res = await db.execute(
                select(RecruiterProfile).where(RecruiterProfile.user_id == user.id)
            )
            prof = rec_res.scalar_one_or_none()
            if prof:
                company_name = prof.company_name
                industry = prof.industry

        resumes_res = await db.execute(
            select(func.count(Resume.id)).where(Resume.candidate_id == user.id)
        )
        resumes_count = resumes_res.scalar() or 0

        jobs_res = await db.execute(
            select(func.count(Job.id)).where(Job.recruiter_id == user.id)
        )
        jobs_count = jobs_res.scalar() or 0

        apps_res = await db.execute(
            select(func.count(Application.id)).where(Application.candidate_id == user.id)
        )
        apps_count = apps_res.scalar() or 0

        return AdminUserItem(
            id=user.id,
            role=user.role,
            full_name=user.full_name,
            email=user.email,
            phone_number=user.phone_number,
            age=user.age,
            gender=user.gender,
            is_active=user.is_active,
            created_at=user.created_at,
            company_name=company_name,
            industry=industry,
            resumes_count=resumes_count,
            jobs_count=jobs_count,
            applications_count=apps_count,
        )

    @staticmethod
    async def update_user_status(
        db: AsyncSession,
        admin_user: User,
        user_id: uuid.UUID,
        is_active: bool,
    ) -> AdminUserItem:
        if admin_user.id == user_id and not is_active:
            raise HTTPException(
                status_code=400,
                detail="Admins cannot deactivate their own account.",
            )

        target_user = await db.get(User, user_id)
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")

        target_user.is_active = is_active
        await db.commit()
        await db.refresh(target_user)

        try:
            await event_dispatcher.emit(
                "admin.user_status_changed",
                {
                    "user_id": str(target_user.id),
                    "is_active": is_active,
                },
            )
        except Exception:
            pass

        return await AdminService.get_user_detail(db, user_id)

    @staticmethod
    async def list_jobs(
        db: AsyncSession,
        search: str | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> AdminJobsListResponse:
        query = select(Job)
        if status:
            query = query.where(Job.status == status)
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.where(
                or_(
                    Job.title.ilike(term),
                    Job.company.ilike(term),
                )
            )

        count_query = select(func.count()).select_from(query.subquery())
        res_count = await db.execute(count_query)
        total = res_count.scalar() or 0

        offset = (page - 1) * page_size
        query = query.order_by(Job.created_at.desc()).offset(offset).limit(page_size)
        res_jobs = await db.execute(query)
        jobs = res_jobs.scalars().all()

        items: list[AdminJobItem] = []
        for j in jobs:
            recruiter_name = None
            recruiter_email = None
            if j.recruiter_id:
                rec_user = await db.get(User, j.recruiter_id)
                if rec_user:
                    recruiter_name = rec_user.full_name
                    recruiter_email = rec_user.email

            app_res = await db.execute(
                select(func.count(Application.id)).where(Application.job_id == j.id)
            )
            app_count = app_res.scalar() or 0

            short_res = await db.execute(
                select(func.count(Application.id)).where(
                    Application.job_id == j.id,
                    Application.status == "shortlisted",
                )
            )
            short_count = short_res.scalar() or 0

            items.append(
                AdminJobItem(
                    id=j.id,
                    title=j.title or "Untitled Job",
                    company=j.company or "Unknown Company",
                    status=j.status or "open",
                    is_taken_down=getattr(j, "is_taken_down", False) or False,
                    takedown_reason=getattr(j, "takedown_reason", None),
                    recruiter_id=j.recruiter_id,
                    recruiter_name=recruiter_name,
                    recruiter_email=recruiter_email,
                    applicant_count=app_count,
                    shortlisted_count=short_count,
                    created_at=j.created_at or datetime.now(timezone.utc),
                )
            )

        has_more = (offset + len(items)) < total

        return AdminJobsListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_more=has_more,
        )

    @staticmethod
    async def takedown_job(
        db: AsyncSession,
        job_id: uuid.UUID,
        reason: str,
    ) -> AdminJobItem:
        job = await db.get(Job, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        job.status = "closed"
        job.is_taken_down = True
        job.takedown_reason = reason.strip()

        await db.commit()
        await db.refresh(job)

        try:
            await event_dispatcher.emit(
                "job.taken_down",
                {
                    "job_id": str(job.id),
                    "recruiter_id": str(job.recruiter_id) if job.recruiter_id else None,
                    "takedown_reason": job.takedown_reason,
                    "status": "closed",
                },
            )
        except Exception:
            pass

        recruiter_name = None
        recruiter_email = None
        if job.recruiter_id:
            rec_user = await db.get(User, job.recruiter_id)
            if rec_user:
                recruiter_name = rec_user.full_name
                recruiter_email = rec_user.email

        app_res = await db.execute(
            select(func.count(Application.id)).where(Application.job_id == job.id)
        )
        app_count = app_res.scalar() or 0

        short_res = await db.execute(
            select(func.count(Application.id)).where(
                Application.job_id == job.id,
                Application.status == "shortlisted",
            )
        )
        short_count = short_res.scalar() or 0

        return AdminJobItem(
            id=job.id,
            title=job.title,
            company=job.company,
            status=job.status,
            is_taken_down=job.is_taken_down,
            takedown_reason=job.takedown_reason,
            recruiter_id=job.recruiter_id,
            recruiter_name=recruiter_name,
            recruiter_email=recruiter_email,
            applicant_count=app_count,
            shortlisted_count=short_count,
            created_at=job.created_at,
        )

    @staticmethod
    async def list_applications(
        db: AsyncSession,
        search: str | None = None,
        job_id: uuid.UUID | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> AdminApplicationsListResponse:
        query = select(Application)
        if job_id:
            query = query.where(Application.job_id == job_id)
        if status:
            query = query.where(Application.status == status)

        count_query = select(func.count()).select_from(query.subquery())
        res_count = await db.execute(count_query)
        total = res_count.scalar() or 0

        offset = (page - 1) * page_size
        query = (
            query.order_by(Application.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        res_apps = await db.execute(query)
        apps = res_apps.scalars().all()

        items: list[AdminApplicationItem] = []
        for app in apps:
            candidate = await db.get(User, app.candidate_id)
            job = await db.get(Job, app.job_id)

            cand_name = candidate.full_name if candidate else "Unknown Candidate"
            cand_email = candidate.email if candidate else ""
            job_title = job.title if job else "Unknown Job"
            job_company = job.company if job else "Unknown Company"

            # Check if search matches candidate or job
            if search and search.strip():
                s_term = search.strip().lower()
                if (
                    s_term not in cand_name.lower()
                    and s_term not in cand_email.lower()
                    and s_term not in job_title.lower()
                    and s_term not in job_company.lower()
                ):
                    continue

            items.append(
                AdminApplicationItem(
                    id=app.id,
                    job_id=app.job_id,
                    candidate_id=app.candidate_id,
                    job_title=job_title,
                    job_company=job_company,
                    candidate_name=cand_name,
                    candidate_email=cand_email,
                    status=app.status,
                    final_score=app.final_score,
                    similarity_score=app.similarity_score,
                    trust_score=app.trust_score,
                    readiness_score=app.readiness_score,
                    created_at=app.created_at,
                )
            )

        has_more = (offset + len(items)) < total

        return AdminApplicationsListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_more=has_more,
        )

    @staticmethod
    async def update_candidate(
        db: AsyncSession,
        candidate_id: uuid.UUID,
        payload: AdminCandidateUpdate,
    ) -> AdminUserItem:
        user = await db.get(User, candidate_id)
        if not user or user.role != "candidate":
            raise HTTPException(status_code=404, detail="Candidate not found")

        new_email = payload.email.strip().lower()
        if new_email != user.email.lower():
            stmt = select(User.id).where(
                func.lower(User.email) == new_email, User.id != candidate_id
            )
            if (await db.execute(stmt)).scalar_one_or_none():
                raise HTTPException(
                    status_code=409,
                    detail="Email is already in use by another account.",
                )
            user.email = new_email

        user.full_name = payload.full_name.strip()
        if payload.phone_number is not None:
            user.phone_number = (
                normalize_phone(payload.phone_number) if payload.phone_number else None
            )
        if payload.age is not None:
            user.age = payload.age
        if payload.gender is not None:
            user.gender = payload.gender

        await db.commit()
        await db.refresh(user)
        return await AdminService.get_user_detail(db, candidate_id)

    @staticmethod
    async def delete_candidate(
        db: AsyncSession,
        candidate_id: uuid.UUID,
    ) -> dict[str, Any]:
        cand = await db.get(User, candidate_id)
        if not cand or cand.role != "candidate":
            raise HTTPException(status_code=404, detail="Candidate not found")

        # 1. Resumes and matches
        resumes_res = await db.execute(
            select(Resume).where(Resume.candidate_id == candidate_id)
        )
        resumes = resumes_res.scalars().all()
        resume_ids = [r.id for r in resumes]
        if resume_ids:
            matches_res = await db.execute(
                select(Match).where(Match.resume_id.in_(resume_ids))
            )
            for m in matches_res.scalars().all():
                await db.delete(m)

        # 2. Candidate applications
        apps_res = await db.execute(
            select(Application).where(Application.candidate_id == candidate_id)
        )
        for a in apps_res.scalars().all():
            await db.delete(a)

        # 3. Notifications for candidate
        notifs_res = await db.execute(
            select(Notification).where(Notification.user_id == candidate_id)
        )
        for n in notifs_res.scalars().all():
            await db.delete(n)

        # 4. Support threads and messages
        threads_res = await db.execute(
            select(SupportThread).where(SupportThread.user_id == candidate_id)
        )
        for t in threads_res.scalars().all():
            msgs_res = await db.execute(
                select(SupportMessage).where(SupportMessage.thread_id == t.id)
            )
            for msg in msgs_res.scalars().all():
                await db.delete(msg)
            await db.delete(t)

        # 5. Delete resumes
        for r in resumes:
            await db.delete(r)

        # 6. Delete user
        await db.delete(cand)
        await db.commit()
        return {
            "status": "success",
            "message": f"Candidate {candidate_id} deleted successfully",
        }

    @staticmethod
    async def create_recruiter(
        db: AsyncSession,
        payload: AdminRecruiterCreate,
    ) -> AdminUserItem:
        stmt = select(User.id).where(
            func.lower(User.email) == payload.email.strip().lower()
        )
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=409,
                detail="A user with this email/ID already exists.",
            )

        phone = (
            normalize_phone(payload.phone_number) if payload.phone_number else None
        )
        user = User(
            role="recruiter",
            full_name=payload.full_name.strip(),
            email=payload.email.strip().lower(),
            phone_number=phone,
            password_hash=hash_password(payload.password),
            is_active=True,
        )
        user.recruiter_profile = RecruiterProfile(
            company_name=payload.company_name.strip(),
            industry=payload.industry.strip() if payload.industry else None,
            company_size=payload.company_size.strip()
            if payload.company_size
            else None,
            company_website=payload.company_website.strip()
            if payload.company_website
            else None,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return await AdminService.get_user_detail(db, user.id)

    @staticmethod
    async def update_recruiter(
        db: AsyncSession,
        recruiter_id: uuid.UUID,
        payload: AdminRecruiterUpdate,
    ) -> AdminUserItem:
        user = await db.get(User, recruiter_id)
        if not user or user.role != "recruiter":
            raise HTTPException(status_code=404, detail="Recruiter not found")

        new_email = payload.email.strip().lower()
        if new_email != user.email.lower():
            stmt = select(User.id).where(
                func.lower(User.email) == new_email, User.id != recruiter_id
            )
            if (await db.execute(stmt)).scalar_one_or_none():
                raise HTTPException(
                    status_code=409,
                    detail="Email is already in use by another account.",
                )
            user.email = new_email

        user.full_name = payload.full_name.strip()
        if payload.phone_number is not None:
            user.phone_number = (
                normalize_phone(payload.phone_number) if payload.phone_number else None
            )

        # Update profile
        prof_res = await db.execute(
            select(RecruiterProfile).where(RecruiterProfile.user_id == recruiter_id)
        )
        prof = prof_res.scalar_one_or_none()
        if not prof:
            prof = RecruiterProfile(
                user_id=recruiter_id,
                company_name=payload.company_name or "Company",
            )
            db.add(prof)

        if payload.company_name:
            prof.company_name = payload.company_name.strip()
        if payload.industry is not None:
            prof.industry = payload.industry.strip() if payload.industry else None
        if payload.company_size is not None:
            prof.company_size = (
                payload.company_size.strip() if payload.company_size else None
            )
        if payload.company_website is not None:
            prof.company_website = (
                payload.company_website.strip() if payload.company_website else None
            )

        await db.commit()
        await db.refresh(user)
        return await AdminService.get_user_detail(db, recruiter_id)

    @staticmethod
    async def reset_recruiter_password(
        db: AsyncSession,
        recruiter_id: uuid.UUID,
        new_password: str,
    ) -> dict[str, str]:
        user = await db.get(User, recruiter_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.password_hash = hash_password(new_password)
        await db.commit()
        return {"status": "success", "message": "Password successfully reset"}

    @staticmethod
    async def delete_recruiter(
        db: AsyncSession,
        recruiter_id: uuid.UUID,
    ) -> dict[str, Any]:
        rec = await db.get(User, recruiter_id)
        if not rec or rec.role != "recruiter":
            raise HTTPException(status_code=404, detail="Recruiter not found")

        # 1. Jobs posted by recruiter
        jobs_res = await db.execute(
            select(Job).where(Job.recruiter_id == recruiter_id)
        )
        jobs = jobs_res.scalars().all()
        job_ids = [j.id for j in jobs]
        if job_ids:
            apps_res = await db.execute(
                select(Application).where(Application.job_id.in_(job_ids))
            )
            for a in apps_res.scalars().all():
                await db.delete(a)

            matches_res = await db.execute(
                select(Match).where(Match.job_id.in_(job_ids))
            )
            for m in matches_res.scalars().all():
                await db.delete(m)

            notifs_res = await db.execute(
                select(Notification).where(Notification.job_id.in_(job_ids))
            )
            for n in notifs_res.scalars().all():
                await db.delete(n)

            for j in jobs:
                await db.delete(j)

        # 2. Recruiter profile
        prof_res = await db.execute(
            select(RecruiterProfile).where(RecruiterProfile.user_id == recruiter_id)
        )
        prof = prof_res.scalar_one_or_none()
        if prof:
            await db.delete(prof)

        # 3. Support threads & messages
        threads_res = await db.execute(
            select(SupportThread).where(SupportThread.user_id == recruiter_id)
        )
        for t in threads_res.scalars().all():
            msgs_res = await db.execute(
                select(SupportMessage).where(SupportMessage.thread_id == t.id)
            )
            for msg in msgs_res.scalars().all():
                await db.delete(msg)
            await db.delete(t)

        # 4. User notifications
        notifs_user = await db.execute(
            select(Notification).where(Notification.user_id == recruiter_id)
        )
        for n in notifs_user.scalars().all():
            await db.delete(n)

        # 5. Delete recruiter user
        await db.delete(rec)
        await db.commit()
        return {
            "status": "success",
            "message": f"Recruiter {recruiter_id} deleted successfully",
        }

    @staticmethod
    async def update_job(
        db: AsyncSession,
        job_id: uuid.UUID,
        payload: AdminJobUpdate,
    ) -> AdminJobItem:
        job = await db.get(Job, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if payload.title is not None:
            job.title = payload.title.strip()
        if payload.company is not None:
            job.company = payload.company.strip()
        if payload.description is not None:
            job.description = payload.description.strip()
        if payload.location is not None:
            job.location = payload.location.strip() if payload.location else None
        if payload.experience is not None:
            job.experience = (
                payload.experience.strip() if payload.experience else None
            )
        if payload.job_type is not None:
            job.job_type = payload.job_type.strip() if payload.job_type else None
        if payload.required_skills is not None:
            job.required_skills = payload.required_skills
        if payload.status is not None:
            job.status = payload.status

        await db.commit()
        await db.refresh(job)

        recruiter_name = None
        recruiter_email = None
        if job.recruiter_id:
            rec_user = await db.get(User, job.recruiter_id)
            if rec_user:
                recruiter_name = rec_user.full_name
                recruiter_email = rec_user.email

        app_res = await db.execute(
            select(func.count(Application.id)).where(Application.job_id == job.id)
        )
        app_count = app_res.scalar() or 0
        short_res = await db.execute(
            select(func.count(Application.id)).where(
                Application.job_id == job.id,
                Application.status == "shortlisted",
            )
        )
        short_count = short_res.scalar() or 0

        return AdminJobItem(
            id=job.id,
            title=job.title,
            company=job.company,
            status=job.status,
            is_taken_down=getattr(job, "is_taken_down", False),
            takedown_reason=getattr(job, "takedown_reason", None),
            recruiter_id=job.recruiter_id,
            recruiter_name=recruiter_name,
            recruiter_email=recruiter_email,
            applicant_count=app_count,
            shortlisted_count=short_count,
            created_at=job.created_at,
        )

    @staticmethod
    async def update_job_status(
        db: AsyncSession,
        job_id: uuid.UUID,
        status: str,
    ) -> AdminJobItem:
        job = await db.get(Job, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        job.status = status
        if status == "open":
            job.is_taken_down = False
            job.takedown_reason = None

        await db.commit()
        await db.refresh(job)

        recruiter_name = None
        recruiter_email = None
        if job.recruiter_id:
            rec_user = await db.get(User, job.recruiter_id)
            if rec_user:
                recruiter_name = rec_user.full_name
                recruiter_email = rec_user.email

        app_res = await db.execute(
            select(func.count(Application.id)).where(Application.job_id == job.id)
        )
        app_count = app_res.scalar() or 0
        short_res = await db.execute(
            select(func.count(Application.id)).where(
                Application.job_id == job.id,
                Application.status == "shortlisted",
            )
        )
        short_count = short_res.scalar() or 0

        return AdminJobItem(
            id=job.id,
            title=job.title,
            company=job.company,
            status=job.status,
            is_taken_down=getattr(job, "is_taken_down", False),
            takedown_reason=getattr(job, "takedown_reason", None),
            recruiter_id=job.recruiter_id,
            recruiter_name=recruiter_name,
            recruiter_email=recruiter_email,
            applicant_count=app_count,
            shortlisted_count=short_count,
            created_at=job.created_at,
        )

    @staticmethod
    async def delete_job(
        db: AsyncSession,
        job_id: uuid.UUID,
    ) -> dict[str, Any]:
        job = await db.get(Job, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        apps_res = await db.execute(
            select(Application).where(Application.job_id == job_id)
        )
        for a in apps_res.scalars().all():
            await db.delete(a)

        matches_res = await db.execute(
            select(Match).where(Match.job_id == job_id)
        )
        for m in matches_res.scalars().all():
            await db.delete(m)

        notifs_res = await db.execute(
            select(Notification).where(Notification.job_id == job_id)
        )
        for n in notifs_res.scalars().all():
            await db.delete(n)

        await db.delete(job)
        await db.commit()
        return {"status": "success", "message": f"Job {job_id} deleted successfully"}

    @staticmethod
    async def list_shortlisted(
        db: AsyncSession,
        search: str | None = None,
        job_id: uuid.UUID | None = None,
        recruiter_id: uuid.UUID | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> AdminShortlistedListResponse:
        query = select(Application).where(Application.status == "shortlisted")
        if job_id:
            query = query.where(Application.job_id == job_id)

        count_query = select(func.count()).select_from(query.subquery())
        res_count = await db.execute(count_query)
        total = res_count.scalar() or 0

        offset = (page - 1) * page_size
        query = (
            query.order_by(Application.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        res_apps = await db.execute(query)
        apps = res_apps.scalars().all()

        items: list[AdminShortlistedItem] = []
        for app in apps:
            candidate = await db.get(User, app.candidate_id)
            job = await db.get(Job, app.job_id)
            recruiter = (
                await db.get(User, job.recruiter_id)
                if job and job.recruiter_id
                else None
            )

            if recruiter_id and (not job or job.recruiter_id != recruiter_id):
                continue

            cand_name = (
                candidate.full_name
                if (candidate and candidate.full_name)
                else (getattr(app, "applicant_name", None) or "Unknown Candidate")
            )
            cand_email = (
                candidate.email
                if (candidate and candidate.email)
                else (getattr(app, "applicant_email", None) or "")
            )
            cand_phone = (
                candidate.phone_number
                if (candidate and candidate.phone_number)
                else getattr(app, "applicant_phone_number", None)
            )
            job_title = job.title if (job and job.title) else "Unknown Job"
            job_company = job.company if (job and job.company) else "Unknown Company"
            rec_name = recruiter.full_name if recruiter else None
            rec_email = recruiter.email if recruiter else None

            if search and search.strip():
                st = search.strip().lower()
                if (
                    st not in cand_name.lower()
                    and st not in cand_email.lower()
                    and st not in job_title.lower()
                    and st not in job_company.lower()
                    and (not rec_name or st not in rec_name.lower())
                ):
                    continue

            items.append(
                AdminShortlistedItem(
                    id=app.id,
                    application_id=app.id,
                    job_id=app.job_id,
                    job_title=job_title,
                    job_company=job_company,
                    recruiter_id=job.recruiter_id if job else None,
                    recruiter_name=rec_name,
                    recruiter_email=rec_email,
                    candidate_id=app.candidate_id,
                    candidate_name=cand_name,
                    candidate_email=cand_email,
                    candidate_phone=cand_phone,
                    status=app.status or "shortlisted",
                    similarity_score=app.similarity_score,
                    trust_score=app.trust_score,
                    readiness_score=app.readiness_score,
                    final_score=app.final_score,
                    created_at=app.created_at or datetime.now(timezone.utc),
                )
            )

        has_more = (offset + len(items)) < total
        return AdminShortlistedListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_more=has_more,
        )
