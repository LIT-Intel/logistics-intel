import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CheckCircle, Star } from "lucide-react";

export default function PricingSection({ handleGetStarted }) {
  const plans = [
    {
      name: "Free",
      price: "$0",
      period: "forever",
      description: "Perfect for getting started",
      features: [
        "50 company searches",
        "Basic search results",
        "5 snippet previews",
        "Email support"
      ],
      cta: "Start Free",
      popular: false
    },
    {
      name: "Starter",
      price: "$79",
      period: "per month",
      description: "For individual sales professionals",
      features: [
        "150 company searches",
        "Full company profiles",
        "Contact enrichment",
        "Data export",
        "Priority support"
      ],
      cta: "Start Free Trial",
      popular: false
    },
    {
      name: "Growth",
      price: "$150",
      period: "per month",
      description: "For growing sales teams",
      features: [
        "500 company searches",
        "250 email automations",
        "100 RFP generations",
        "Campaign analytics",
        "LinkedIn integration",
        "Team collaboration"
      ],
      cta: "Start Free Trial",
      popular: true
    },
    {
      name: "Growth+",
      price: "$350",
      period: "per month", 
      description: "For enterprise sales operations",
      features: [
        "1,500 company searches",
        "1,500 email automations",
        "500 RFP generations",
        "Advanced AI insights",
        "White-label options",
        "Dedicated success manager"
      ],
      cta: "Contact Sales",
      popular: false
    }
  ];

  return (
    <section className="py-16 md:py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12 md:mb-16"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 md:mb-6">
            Simple, Transparent{" "}
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Pricing
            </span>
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
            Start free, upgrade when you're ready. No hidden fees, no long-term contracts.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className={`relative bg-white rounded-2xl p-6 md:p-8 ${
                plan.popular 
                  ? 'ring-2 ring-blue-500 shadow-2xl scale-105' 
                  : 'border border-gray-200 shadow-lg'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 md:px-6 py-2 rounded-full flex items-center gap-2 text-sm font-semibold">
                    <Star className="w-4 h-4 fill-current" />
                    Most Popular
                  </div>
                </div>
              )}

              <div className="text-center mb-6 md:mb-8">
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <div className="mb-4">
                  <span className="text-3xl md:text-4xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-gray-500 ml-2 text-sm md:text-base">/{plan.period}</span>
                </div>
                <p className="text-gray-600 text-sm md:text-base">{plan.description}</p>
              </div>

              <ul className="space-y-3 md:space-y-4 mb-6 md:mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 text-sm md:text-base">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={handleGetStarted}
                className={`w-full py-3 text-base md:text-lg font-semibold rounded-xl ${
                  plan.popular
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg'
                    : 'border-2 border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
                variant={plan.popular ? "default" : "outline"}
              >
                {plan.cta}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}