import { categoriesApi, profileApi } from "../api/endpoints";
import { LoadError, PrivacyNote } from "../components/Feedback";
import { ProfileForm } from "../components/profile/ProfileForm";
import { useAsync } from "../hooks/useAsync";
import { usePageTitle } from "../lib/usePageTitle";
import { PageSkeleton } from "../components/PageSkeleton";

export function Onboarding() {
  usePageTitle("Life Profile");
  const { data, loading, error, retry } = useAsync(async () => {
    const [categories, profile] = await Promise.all([categoriesApi.list(), profileApi.get()]);
    return { categories, profile };
  });

  if (error) return <LoadError message={error} onRetry={retry} />;
  if (loading || !data) return <PageSkeleton />;

  return (
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">Step 1 · Life Profile</p>
        <h1>Your Life Profile</h1>
        <p className="page-subtitle">
          Tell us a little about yourself. This shapes how your updates get interpreted, and the areas you pick
          count 1.5× in your overall score.
        </p>
      </header>
      <PrivacyNote />
      <ProfileForm categories={data.categories} initial={data.profile} />
    </div>
  );
}
