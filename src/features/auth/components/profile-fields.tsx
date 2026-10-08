"use client"

import { useFormContext } from "react-hook-form"
import { messages } from "@/lib/messages/es"
import { Input } from "@/components/ui/input"
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import type { ProfileFieldsInput } from "../schemas/auth-schemas"

/** First name, last name, phone and DNI inputs. Must render inside a `<Form>` whose values include `ProfileFieldsInput`. */
export function ProfileFields() {
  const { control } = useFormContext<ProfileFieldsInput>()

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          control={control}
          name="firstName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{messages.register.firstNameLabel}</FormLabel>
              <FormControl>
                <Input className="h-11 rounded-xl" autoComplete="given-name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="lastName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{messages.register.lastNameLabel}</FormLabel>
              <FormControl>
                <Input className="h-11 rounded-xl" autoComplete="family-name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={control}
        name="phone"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{messages.register.phoneLabel}</FormLabel>
            <FormControl>
              <Input className="h-11 rounded-xl" type="tel" autoComplete="tel" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="dni"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{messages.register.dniLabel}</FormLabel>
            <FormControl>
              <Input className="h-11 rounded-xl" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}
