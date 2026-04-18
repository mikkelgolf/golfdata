"use client";

import { useState } from "react";
import { SimpleModal } from "@/components/simple-modal";
import ContactForm from "@/components/contact-form";

export default function FooterContact() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
      >
        Contact
      </button>
      <SimpleModal
        open={open}
        onClose={() => setOpen(false)}
        title="Contact College Golf Data"
        subtitle="Opens a draft in your email app"
        widthClass="max-w-lg"
      >
        <div className="px-4 py-4">
          <ContactForm compact onSubmitted={() => setTimeout(() => setOpen(false), 1200)} />
        </div>
      </SimpleModal>
    </>
  );
}
