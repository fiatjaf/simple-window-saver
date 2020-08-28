archive.zip: $(shell ag -l --js)
	zip -r archive * -x do_not_package
