import { useTranslations } from 'next-intl';
import { Background } from '@/components/Background';
import { FeatureCard } from '@/features/landing/FeatureCard';
import { Section } from '@/features/landing/Section';

export const Features = () => {
  const t = useTranslations('Features');
  const features = [
    {
      title: t('feature1_title'),
      description: t('feature1_description'),
    },
    {
      title: t('feature2_title'),
      description: t('feature2_description'),
    },
    {
      title: t('feature3_title'),
      description: t('feature3_description'),
    },
    {
      title: t('feature4_title'),
      description: t('feature4_description'),
    },
    {
      title: t('feature5_title'),
      description: t('feature5_description'),
    },
    {
      title: t('feature6_title'),
      description: t('feature6_description'),
    },
  ];

  return (
    <Background>
      <Section
        id="features"
        subtitle={t('section_subtitle')}
        title={t('section_title')}
        description={t('section_description')}
      >
        <div className="
          grid grid-cols-1 gap-x-3 gap-y-8
          md:grid-cols-3
        "
        >
          {features.map(feature => (
            <FeatureCard
              key={feature.title}
              icon={(
                <svg
                  className="stroke-primary-foreground stroke-2"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M0 0h24v24H0z" stroke="none" />
                  <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3M12 12l8-4.5M12 12v9M12 12L4 7.5" />
                </svg>
              )}
              title={feature.title}
            >
              {feature.description}
            </FeatureCard>
          ))}
        </div>
      </Section>
    </Background>
  );
};
