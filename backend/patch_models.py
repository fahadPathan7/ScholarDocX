with open('backend/app/db/models.py', 'r') as f:
    content = f.read()

anchor = "sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))"
insertion = "    polar_product_id: Mapped[str] = mapped_column(Text, nullable=True)"

if insertion not in content:
    content = content.replace(anchor, anchor + "\n" + insertion)
    with open('backend/app/db/models.py', 'w') as f:
        f.write(content)
    print("Added polar_product_id to models.py")
